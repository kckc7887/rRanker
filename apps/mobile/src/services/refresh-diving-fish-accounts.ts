import type { BoundAccount } from '@/domain/bound-account';
import type { CatalogSnapshot, ScoreSnapshot } from '@/domain/models';
import { DivingFishProvider } from '@/providers/diving-fish-provider';
import { ProviderError } from '@/providers/errors';
import type { ProviderSession } from '@/providers/contracts';
import type { DivingFishUploadRecord } from '@/services/score-hub-sync-map';
import { buildScoreSnapshot } from '@/services/score-service';
import { uploadedRecordsAreVisible } from '@/services/upload-refresh-visibility';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';
import { captureResourceWrites } from '@/services/snapshot-cache-utils';
import { withUploadAbortSignal, waitForUploadDelay, type ScoreHubAbortSignal } from '@/services/score-hub-http';

const REFRESH_RETRY_DELAYS_MS = [0, 2_000, 5_000, 10_000] as const;
const repository = new SqliteSnapshotRepository();

export type RefreshedDivingFishAccount = {
  account: BoundAccount;
  snapshot: ScoreSnapshot;
};

export type FailedDivingFishAccountRefresh = {
  account: BoundAccount;
  error: Error;
};

export type RefreshDivingFishAccountsResult = {
  refreshed: RefreshedDivingFishAccount[];
  failed: FailedDivingFishAccountRefresh[];
};


async function refreshOne(input: {
  account: BoundAccount;
  session: ProviderSession;
  catalog: CatalogSnapshot;
  expectedRecords?: readonly DivingFishUploadRecord[];
  signal?: ScoreHubAbortSignal;
  assertAccount?: (accountId: string) => void;
}): Promise<ScoreSnapshot> {
  const guardGeneration = captureResourceWrites(input.account.gameId, undefined, input.account.id);
  const assertCurrent = () => {
    if (input.signal?.aborted) throw new Error('已取消');
    input.assertAccount?.(input.account.id);
    guardGeneration();
  };
  let lastError: unknown;
  let lastReadableSnapshot: ScoreSnapshot | null = null;
  for (const delay of REFRESH_RETRY_DELAYS_MS) {
    assertCurrent();
    if (input.signal?.aborted) throw new Error('已取消');
    if (delay > 0) await waitForUploadDelay(delay, input.signal);
    await input.signal?.waitUntilResumed?.();
    if (input.signal?.aborted) throw new Error('已取消');
    try {
      const provider = new DivingFishProvider(input.session);
      const [player, rawRecords] = await withUploadAbortSignal(input.signal, signal => Promise.all([
        provider.getPlayer(signal),
        provider.getRecords(signal),
      ]));
      const snapshot = buildScoreSnapshot(player, rawRecords, input.catalog);
      if (input.expectedRecords?.length
        && !uploadedRecordsAreVisible(snapshot.records, input.expectedRecords)) {
        /** 宴谱和曲名映射差异不应推翻已成功的读取。 */
        lastReadableSnapshot = snapshot;
        continue;
      }
      assertCurrent();
      await repository.save(input.account.id, snapshot, assertCurrent);
      assertCurrent();
      return snapshot;
    } catch (error) {
      assertCurrent();
      lastError = error;
      if (error instanceof ProviderError && !error.retryable) throw error;
    }
  }
  if (lastReadableSnapshot) {
    assertCurrent();
    await repository.save(input.account.id, lastReadableSnapshot, assertCurrent);
    assertCurrent();
    return lastReadableSnapshot;
  }
  if (lastError instanceof Error) throw lastError;
  throw new Error('应用内成绩同步失败');
}

export async function refreshDivingFishAccounts(input: {
  accounts: readonly BoundAccount[];
  sessionsByAccountId: Record<string, ProviderSession | undefined>;
  catalog: CatalogSnapshot;
  expectedRecords?: readonly DivingFishUploadRecord[];
  signal?: ScoreHubAbortSignal;
  assertAccount?: (accountId: string) => void;
  onRefreshing?: (account: BoundAccount) => void;
}): Promise<RefreshDivingFishAccountsResult> {
  const refreshed: RefreshedDivingFishAccount[] = [];
  const failed: FailedDivingFishAccountRefresh[] = [];

  for (const account of input.accounts) {
    await input.signal?.waitUntilResumed?.();
    if (input.signal?.aborted) throw new Error('已取消');
    const session = input.sessionsByAccountId[account.id];
    if (!session || session.mode !== 'import-token') {
      failed.push({ account, error: new Error('缺少可读取的水鱼 Import-Token') });
      continue;
    }
    input.onRefreshing?.(account);
    try {
      const snapshot = await refreshOne({
        account,
        session,
        catalog: input.catalog,
        expectedRecords: input.expectedRecords,
        signal: input.signal,
        assertAccount: input.assertAccount,
      });
      refreshed.push({ account, snapshot });
    } catch (error) {
      failed.push({
        account,
        error: error instanceof Error ? error : new Error('应用内成绩同步失败'),
      });
    }
  }

  return { refreshed, failed };
}
