import { ProviderError } from '@/providers/errors';
import { uploadRecordsToDivingFish } from '@/services/diving-fish-upload';
import { uploadRecordsToLxns } from '@/services/lxns-upload';
import { ScoreHubError, fetchLatestSync } from '@/services/score-hub-client';
import {
  buildMusicTitleMap,
  convertHubScoresToDivingFishRecords,
  convertHubScoresToLocalRecords,
  convertHubScoresToLxnsRecords,
} from '@/services/score-hub-sync-map';
import { buildScoreSnapshot } from '@/services/score-service';
import type { UploadCommonInput, UploadResult, UploadTarget, UploadTargetResult } from '@/services/upload-maimai-types';

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
    await input.signal.waitUntilResumed?.();
    if (input.signal.aborted) throw new ScoreHubError('已取消');
    let written = 0;
    let status: UploadTargetResult['status'] = 'success';
    let targetSkipped = 0;
    try {
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
          source,
        }, localMapped.records, catalog);
        const assertTarget = () => {
          if (input.signal.aborted) throw new ScoreHubError('已取消');
          input.assertAccount(target.account.id);
        };
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
        status = result.status;
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
        status = result.status;
      }
      uploadedTotal += written;
      skipped += targetSkipped;
      targetResults.push({
        account: target.account,
        status,
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

  input.onPhase(completionPhase(targetResults, uploadedTotal, skipped));
  return { uploaded: uploadedTotal, skipped, refreshedAccounts, failedAccountNames, targetResults };
}

function completionPhase(targetResults: UploadTargetResult[], uploaded: number, skipped: number): import('@/services/upload-maimai-types').UploadPhase {
  const failed = targetResults.filter(item => item.status === 'failed');
  const unconfirmed = targetResults.filter(item => item.status === 'unconfirmed');
  const names = (items: UploadTargetResult[]) => items.map(item => item.account.displayName).join('、');
  if (targetResults.every(item => item.status === 'failed')) {
    return { kind: 'error', message: `写入失败：${names(failed)}，请重试。` };
  }
  let message = skipped > 0 ? `完成：写入 ${uploaded} 条，跳过 ${skipped} 条` : `完成：写入 ${uploaded} 条`;
  if (unconfirmed.length) {
    message = `已确认写入 ${uploaded} 条；未确认 ${names(unconfirmed)}，请先核对成绩${failed.length ? `；失败 ${names(failed)}` : ''}`;
  } else if (failed.length) {
    message = `部分完成：写入 ${uploaded} 条；失败 ${names(failed)}`;
  }
  return { kind: 'done', message, uploaded, skipped };
}
