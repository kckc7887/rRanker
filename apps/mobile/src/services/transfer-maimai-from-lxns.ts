import type { BoundAccount } from '@/domain/bound-account';
import type { CatalogSnapshot, Player, ScoreSnapshot } from '@/domain/models';
import type { ProviderSession } from '@/providers/contracts';
import { ProviderError } from '@/providers/errors';
import type { LxnsOAuthSession } from '@/providers/lxns-oauth';
import { LxnsScoreProvider } from '@/providers/lxns-score-provider';
import { uploadRecordsToDivingFish } from '@/services/diving-fish-upload';
import { uploadRecordsToLxns } from '@/services/lxns-upload';
import { refreshDivingFishAccounts } from '@/services/refresh-diving-fish-accounts';
import {
  convertScoreRecordsToDivingFishRecords,
  convertScoreRecordsToLxnsRecords,
} from '@/services/score-hub-sync-map';
import { buildScoreSnapshot } from '@/services/score-service';
import type {
  UploadResult,
  UploadTarget,
  UploadTargetResult,
} from '@/services/upload-maimai-from-friend-code';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';

export type LxnsTransferPhase =
  | { kind: 'reading'; account: BoundAccount }
  | { kind: 'uploading'; account: BoundAccount }
  | { kind: 'refreshing'; account: BoundAccount };

type TransferSignal = { aborted: boolean };

function assertNotCanceled(signal?: TransferSignal) {
  if (signal?.aborted) throw new ProviderError('unknown', '已取消', false);
}

function skippedCount(mapped: {
  skippedBadScore: number;
  skippedUnsupportedChart: number;
  skippedNoSong?: number;
  skippedNoTitle?: number;
}) {
  return mapped.skippedBadScore
    + mapped.skippedUnsupportedChart
    + (mapped.skippedNoSong ?? 0)
    + (mapped.skippedNoTitle ?? 0);
}

function localPlayer(target: BoundAccount, sourcePlayer: Player): Player {
  return {
    ...sourcePlayer,
    id: target.id,
    displayName: target.displayName,
    source: {
      kind: 'local',
      label: `本地查分器（来自 ${sourcePlayer.displayName} 的落雪数据）`,
      updatedAt: new Date().toISOString(),
      isStale: false,
    },
  };
}

/**
 * 读取一个已绑定落雪账号的舞萌成绩，并写入用户明确勾选的查分器账号。
 * 来源账号本身只刷新本地快照，不会重复回写到同一个落雪玩家。
 */
export async function transferMaimaiFromLxns(input: {
  sourceAccount: BoundAccount;
  sourceSession: ProviderSession;
  selected: readonly UploadTarget[];
  sessionsByAccountId: Record<string, ProviderSession | undefined>;
  catalog: CatalogSnapshot;
  signal?: TransferSignal;
  onPhase?: (phase: LxnsTransferPhase) => void;
  onLxnsTokensRotated?: (
    accountId: string,
    session: LxnsOAuthSession,
  ) => void | Promise<void>;
}): Promise<UploadResult> {
  if (input.sourceAccount.providerId !== 'lxns' || input.sourceSession.mode !== 'lxns-oauth') {
    throw new ProviderError('authentication', '数据来源必须是已授权的舞萌落雪账号', false);
  }
  if (input.selected.length === 0) {
    throw new ProviderError('no_data', '请至少勾选一个上传目标', false);
  }
  if (input.selected.some((target) => !target.writable)) {
    throw new ProviderError('permission', '所选目标中包含不可写账号', false);
  }
  if (input.selected.some((target) => target.account.id === input.sourceAccount.id)) {
    throw new ProviderError('permission', '数据来源不能同时作为上传目标', false);
  }

  assertNotCanceled(input.signal);
  input.onPhase?.({ kind: 'reading', account: input.sourceAccount });
  const sourceProvider = new LxnsScoreProvider(
    input.sourceSession,
    (next) => input.onLxnsTokensRotated?.(input.sourceAccount.id, next),
  );
  const [sourcePlayer, sourceRecords] = await Promise.all([
    sourceProvider.getPlayer(),
    sourceProvider.getRecords(),
  ]);
  if (sourceRecords.length === 0) {
    throw new ProviderError(
      'no_data',
      '所选落雪账号暂无舞萌成绩，请先完成离线同步并等待服务器处理',
      false,
    );
  }

  const repository = new SqliteSnapshotRepository();
  const sourceSnapshot = buildScoreSnapshot(sourcePlayer, sourceRecords, input.catalog);
  await repository.save(input.sourceAccount.id, sourceSnapshot);

  const divingFishMapped = convertScoreRecordsToDivingFishRecords(sourceSnapshot.records);
  const lxnsMapped = convertScoreRecordsToLxnsRecords(sourceSnapshot.records);
  const targetResults: UploadTargetResult[] = [];
  const refreshedAccounts: { account: BoundAccount; snapshot: ScoreSnapshot }[] = [
    { account: input.sourceAccount, snapshot: sourceSnapshot },
  ];
  const failedAccountNames: string[] = [];
  const refreshFailedAccountIds = new Set<string>();
  const uploadedDivingFishAccounts: BoundAccount[] = [];
  let uploaded = 0;
  let skipped = 0;

  for (const target of input.selected) {
    assertNotCanceled(input.signal);
    input.onPhase?.({ kind: 'uploading', account: target.account });
    let written = 0;
    let targetSkipped = 0;
    try {
      if (target.account.providerId === 'local') {
        const snapshot = buildScoreSnapshot(
          localPlayer(target.account, sourcePlayer),
          sourceSnapshot.records,
          input.catalog,
        );
        await repository.save(target.account.id, snapshot);
        refreshedAccounts.push({ account: target.account, snapshot });
        written = snapshot.records.length;
      } else if (target.account.providerId === 'diving-fish') {
        targetSkipped = skippedCount(divingFishMapped);
        const session = input.sessionsByAccountId[target.account.id];
        if (!session || session.mode !== 'import-token') {
          throw new ProviderError('authentication', '水鱼上传需要 Import-Token', false);
        }
        written = (await uploadRecordsToDivingFish(
          session.value,
          divingFishMapped.records,
          input.signal,
        )).uploaded;
        uploadedDivingFishAccounts.push(target.account);
      } else if (target.account.providerId === 'lxns') {
        targetSkipped = skippedCount(lxnsMapped);
        const session = input.sessionsByAccountId[target.account.id];
        if (!session || session.mode !== 'lxns-oauth') {
          throw new ProviderError('authentication', '落雪上传需要 OAuth 授权', false);
        }
        const uploadResult = await uploadRecordsToLxns({
          session,
          records: lxnsMapped.records,
          signal: input.signal,
          onTokensRotated: (next) => input.onLxnsTokensRotated?.(target.account.id, next),
        });
        written = uploadResult.uploaded;

        try {
          input.onPhase?.({ kind: 'refreshing', account: target.account });
          const provider = new LxnsScoreProvider(
            uploadResult.session,
            (next) => input.onLxnsTokensRotated?.(target.account.id, next),
          );
          const [player, records] = await Promise.all([
            provider.getPlayer(),
            provider.getRecords(),
          ]);
          const snapshot = buildScoreSnapshot(player, records, input.catalog);
          await repository.save(target.account.id, snapshot);
          refreshedAccounts.push({ account: target.account, snapshot });
        } catch {
          failedAccountNames.push(target.account.displayName);
          refreshFailedAccountIds.add(target.account.id);
        }
      } else {
        throw new ProviderError('permission', '该查分器不支持写入舞萌成绩', false);
      }

      uploaded += written;
      skipped += targetSkipped;
      targetResults.push({
        account: target.account,
        status: 'success',
        written,
        skipped: targetSkipped,
        refreshFailed: refreshFailedAccountIds.has(target.account.id),
      });
    } catch (error) {
      assertNotCanceled(input.signal);
      skipped += targetSkipped;
      targetResults.push({
        account: target.account,
        status: 'failed',
        written: 0,
        skipped: targetSkipped,
        errorMessage: error instanceof Error ? error.message : '写入失败',
      });
    }
  }

  if (uploadedDivingFishAccounts.length > 0) {
    const refreshResult = await refreshDivingFishAccounts({
      accounts: uploadedDivingFishAccounts,
      sessionsByAccountId: input.sessionsByAccountId,
      catalog: input.catalog,
      expectedRecords: divingFishMapped.records,
      signal: input.signal,
      onRefreshing: (account) => input.onPhase?.({ kind: 'refreshing', account }),
    });
    refreshedAccounts.push(...refreshResult.refreshed);
    for (const failed of refreshResult.failed) {
      failedAccountNames.push(failed.account.displayName);
      const outcome = targetResults.find((item) => item.account.id === failed.account.id);
      if (outcome) outcome.refreshFailed = true;
    }
  }

  assertNotCanceled(input.signal);
  return {
    uploaded,
    skipped,
    refreshedAccounts,
    failedAccountNames,
    targetResults,
  };
}
