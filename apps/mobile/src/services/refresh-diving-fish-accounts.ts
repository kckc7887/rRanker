import type { BoundAccount } from '@/domain/bound-account';
import type { CatalogSnapshot, ScoreSnapshot } from '@/domain/models';
import { DivingFishProvider } from '@/providers/diving-fish-provider';
import { ProviderError } from '@/providers/errors';
import type { ProviderSession } from '@/providers/contracts';
import type { DivingFishUploadRecord } from '@/services/score-hub-sync-map';
import { buildScoreSnapshot } from '@/services/score-service';
import { uploadedRecordsAreVisible } from '@/services/upload-refresh-visibility';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function refreshOne(input: {
  account: BoundAccount;
  session: ProviderSession;
  catalog: CatalogSnapshot;
  expectedRecords?: readonly DivingFishUploadRecord[];
  signal?: { aborted: boolean };
}): Promise<ScoreSnapshot> {
  let lastError: unknown;
  let lastReadableSnapshot: ScoreSnapshot | null = null;
  for (const delay of REFRESH_RETRY_DELAYS_MS) {
    if (input.signal?.aborted) throw new Error('已取消');
    if (delay > 0) await sleep(delay);
    if (input.signal?.aborted) throw new Error('已取消');
    try {
      const provider = new DivingFishProvider(input.session);
      const [player, rawRecords] = await Promise.all([
        provider.getPlayer(),
        provider.getRecords(),
      ]);
      const snapshot = buildScoreSnapshot(player, rawRecords, input.catalog);
      if (input.expectedRecords?.length
        && !uploadedRecordsAreVisible(snapshot.records, input.expectedRecords)) {
        // 严格逐条回配仅用于等待水鱼最终一致性；宴会场、曲名归一化等差异
        // 不能推翻一次已经成功的账号读取，更不能把已写入的数据误报成同步失败。
        lastReadableSnapshot = snapshot;
        continue;
      }
      await repository.save(input.account.id, snapshot);
      return snapshot;
    } catch (error) {
      lastError = error;
      if (error instanceof ProviderError && !error.retryable) throw error;
    }
  }
  if (lastReadableSnapshot) {
    await repository.save(input.account.id, lastReadableSnapshot);
    return lastReadableSnapshot;
  }
  if (lastError instanceof Error) throw lastError;
  throw new Error('应用内成绩同步失败');
}

/**
 * 直接按上传目标账号读取水鱼并写入分账号快照。
 * 读取成功但尚未出现刚上传成绩时也会重试，覆盖水鱼的最终一致性窗口。
 */
export async function refreshDivingFishAccounts(input: {
  accounts: readonly BoundAccount[];
  sessionsByAccountId: Record<string, ProviderSession | undefined>;
  catalog: CatalogSnapshot;
  expectedRecords?: readonly DivingFishUploadRecord[];
  signal?: { aborted: boolean };
  onRefreshing?: (account: BoundAccount) => void;
}): Promise<RefreshDivingFishAccountsResult> {
  const refreshed: RefreshedDivingFishAccount[] = [];
  const failed: FailedDivingFishAccountRefresh[] = [];

  // 串行读取，避免多个账号同时触发水鱼限流。
  for (const account of input.accounts) {
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
