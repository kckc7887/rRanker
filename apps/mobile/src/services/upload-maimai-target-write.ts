import { ProviderError } from '@/providers/errors';
import { ScoreHubError, fetchLatestSync } from '@/services/score-hub-client';
import { uploadRecordsToDivingFish } from '@/services/diving-fish-upload';
import { uploadRecordsToLxns } from '@/services/lxns-upload';
import {
  buildMusicTitleMap,
  convertHubScoresToDivingFishRecords,
  convertHubScoresToLocalRecords,
  convertHubScoresToLxnsRecords,
} from '@/services/score-hub-sync-map';
import { buildScoreSnapshot } from '@/services/score-service';
import type { UploadCommonInput, UploadResult, UploadTarget, UploadTargetResult } from '@/services/upload-maimai-from-friend-code';

export async function uploadLatestScoreHubSyncToTargets(input: UploadCommonInput & {
  token: string;
  playerIdForLocal: string;
  selected: UploadTarget[];
  persistFriendCode?: string | null;
  assertAccount: (accountId: string) => void;
}): Promise<UploadResult> {
  const sync = await fetchLatestSync(input.token, input.signal);
  const scores = sync?.scores ?? [];
  if (scores.length === 0) {
    throw new ScoreHubError('未获取到成绩数据');
  }
  const needsDivingFish = input.selected.some((target) => target.account.providerId === 'diving-fish');
  const needsLocal = input.selected.some((target) => target.account.providerId === 'local');
  const catalog = needsDivingFish || needsLocal
    ? await input.resolveCatalog()
    : null;
  if (input.signal.aborted) throw new ScoreHubError('已取消');

  const divingFishMapped = needsDivingFish && catalog
    ? convertHubScoresToDivingFishRecords(scores, buildMusicTitleMap(catalog))
    : null;
  const localMapped = needsLocal && catalog
    ? convertHubScoresToLocalRecords(scores, catalog)
    : null;
  const lxnsMapped = input.selected.some((target) => target.account.providerId === 'lxns')
    ? convertHubScoresToLxnsRecords(scores)
    : null;
  let uploadedTotal = 0;
  let skipped = 0;
  const targetResults: UploadTargetResult[] = [];
  const refreshedAccounts: UploadResult['refreshedAccounts'] = [];
  const failedAccountNames: string[] = [];

  for (const target of input.selected) {
    if (input.signal.aborted) throw new ScoreHubError('已取消');
    let written = 0;
    let targetSkipped = 0;
    try {
      // 每个目标写入前复核账号是否仍有效：失效目标不发起后续写入，其他目标继续。
      input.assertAccount(target.account.id);
      input.onPhase({
        kind: 'uploading',
        message: `写入${target.account.displayName}（${target.account.providerTitle}）中…`,
        providerTitle: target.account.providerTitle,
      });
      if (target.account.providerId === 'local') {
        if (!localMapped || !catalog) {
          throw new ProviderError('no_data', '未能准备本地成绩', false);
        }
        targetSkipped = localMapped.skippedNoSong
          + localMapped.skippedBadScore
          + localMapped.skippedUnsupportedChart;
        if (localMapped.records.length === 0) {
          throw new ProviderError('no_data', '没有可保存到本地的成绩', false);
        }
        const source = {
          kind: 'local' as const,
          label: '本地查分器',
          updatedAt: new Date().toISOString(),
          isStale: false,
        };
        const snapshot = buildScoreSnapshot({
          id: input.playerIdForLocal,
          displayName: target.account.displayName,
          rating: 0,
          additionalRating: 0,
          source,
        }, localMapped.records, catalog);
        const assertTarget = () => input.assertAccount(target.account.id);
        assertTarget();
        const { SqliteSnapshotRepository } = await import('@/storage/sqlite-snapshot-repository');
        await new SqliteSnapshotRepository().save(target.account.id, snapshot, assertTarget);
        refreshedAccounts.push({ account: target.account, snapshot, assertCurrent: assertTarget });
        written = localMapped.records.length;
      } else if (target.account.providerId === 'diving-fish') {
        if (!divingFishMapped) {
          throw new ProviderError('no_data', '未能准备水鱼成绩', false);
        }
        targetSkipped = divingFishMapped.skippedNoTitle
          + divingFishMapped.skippedBadScore
          + divingFishMapped.skippedUnsupportedChart;
        const session = input.sessionsByAccountId[target.account.id];
        if (!session || session.mode !== 'import-token') {
          throw new ProviderError('authentication', '水鱼上传需要 Import-Token', false);
        }
        const result = await uploadRecordsToDivingFish(
          session.value,
          divingFishMapped.records,
          input.signal,
          { assertEligible: () => input.assertAccount(target.account.id) },
        );
        written = result.uploaded;
      } else if (target.account.providerId === 'lxns') {
        if (!lxnsMapped) {
          throw new ProviderError('no_data', '未能准备落雪成绩', false);
        }
        targetSkipped = lxnsMapped.skippedNoSong
          + lxnsMapped.skippedBadScore
          + lxnsMapped.skippedUnsupportedChart;
        const session = input.sessionsByAccountId[target.account.id];
        if (!session || session.mode !== 'lxns-oauth') {
          throw new ProviderError('authentication', '落雪上传需要 OAuth 授权', false);
        }
        const result = await uploadRecordsToLxns({
          session,
          records: lxnsMapped.records,
          signal: input.signal,
          assertEligible: () => input.assertAccount(target.account.id),
          onTokensRotated: (update) => input.onLxnsTokensRotated?.(target.account.id, update),
        });
        written = result.uploaded;
      }
      uploadedTotal += written;
      skipped += targetSkipped;
      targetResults.push({
        account: target.account,
        status: 'success',
        written,
        skipped: targetSkipped,
      });
    } catch (error) {
      if (input.signal.aborted) throw new ScoreHubError('已取消');
      const message = error instanceof Error ? error.message : '写入失败';
      skipped += targetSkipped;
      targetResults.push({
        account: target.account,
        status: 'failed',
        written: 0,
        skipped: targetSkipped,
        errorMessage: message,
      });
    }
  }
  if (input.signal.aborted) throw new ScoreHubError('已取消');

  const failedTargets = targetResults.filter((item) => item.status === 'failed');
  if (targetResults.every((item) => item.status === 'failed')) {
    input.onPhase({
      kind: 'error',
      message: `写入失败：${failedTargets.map((item) => item.account.displayName).join('、')}，请重试。`,
    });
    return {
      uploaded: uploadedTotal,
      skipped,
      refreshedAccounts,
      failedAccountNames,
      targetResults,
    };
  }

  input.onPhase({
    kind: 'done',
    message: failedTargets.length > 0
      ? `部分完成：写入 ${uploadedTotal} 条；失败 ${failedTargets.map((item) => item.account.displayName).join('、')}`
      : skipped > 0
        ? `完成：写入 ${uploadedTotal} 条，跳过 ${skipped} 条`
        : `完成：写入 ${uploadedTotal} 条`,
    uploaded: uploadedTotal,
    skipped,
  });
  return {
    uploaded: uploadedTotal,
    skipped,
    refreshedAccounts,
    failedAccountNames,
    targetResults,
  };
}
