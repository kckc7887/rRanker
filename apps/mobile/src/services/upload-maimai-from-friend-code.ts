import type { CatalogSnapshot, ScoreSnapshot } from '@/domain/models';
import type { BoundAccount } from '@/domain/bound-account';
import type { ProviderSession } from '@/providers/contracts';
import { ProviderError } from '@/providers/errors';
import {
  createFriendLoginJob,
  createUpdateScoreJob,
  fetchLatestSync,
  pollLoginUntilToken,
  pollUpdateScoreUntilDone,
  ScoreHubError,
  type ScoreHubAbortSignal,
  type ScoreHubScoreProgress,
} from '@/services/score-hub-client';
import { uploadRecordsToDivingFish } from '@/services/diving-fish-upload';
import {
  buildMusicTitleMap,
  convertHubScoresToDivingFishRecords,
  convertHubScoresToLocalRecords,
  convertHubScoresToLxnsRecords,
} from '@/services/score-hub-sync-map';
import { LOCAL_MAIMAI_ACCOUNT_ID, MAIMAI_TEST_ACCOUNT_ID } from '@/domain/bound-account';
import { uploadRecordsToLxns } from '@/services/lxns-upload';
import { buildScoreSnapshot } from '@/services/score-service';
import type { LxnsOAuthSession } from '@/providers/lxns-oauth';

export type UploadPhase =
  | { kind: 'idle' }
  | { kind: 'logging_in'; message: string }
  | { kind: 'awaiting_friend'; message: string; botFriendCode: string | null }
  | { kind: 'fetching_scores'; message: string }
  | { kind: 'uploading'; message: string; providerTitle: string }
  | { kind: 'syncing'; message: string; providerTitle: string }
  | { kind: 'canceling'; message: string }
  | { kind: 'done'; message: string; uploaded: number; skipped: number }
  | { kind: 'error'; message: string };

export type UploadResult = {
  uploaded: number;
  skipped: number;
  refreshedAccounts: { account: BoundAccount; snapshot: ScoreSnapshot }[];
  failedAccountNames: string[];
  targetResults: UploadTargetResult[];
};

export type UploadTargetResult = {
  account: BoundAccount;
  status: 'success' | 'failed';
  written: number;
  skipped: number;
  errorMessage?: string;
  refreshFailed?: boolean;
};

export type UploadTarget = {
  account: BoundAccount;
  writable: boolean;
  disableReason: string | null;
};

const DIFFICULTY_LABELS: Record<number, string> = {
  0: 'BASIC',
  1: 'ADVANCED',
  2: 'EXPERT',
  3: 'MASTER',
  4: 'Re:MASTER',
  10: '宴会场',
};

export function scoreProgressMessage(progress: ScoreHubScoreProgress | null): string {
  if (!progress || progress.totalDiffs <= 0) return '获取成绩中…';
  const completed = [...new Set(progress.completedDiffs)].sort((left, right) => left - right);
  if (completed.length === 0) {
    return `获取各难度成绩中…（0/${progress.totalDiffs}）`;
  }
  const completedLabels = completed
    .map((difficulty) => DIFFICULTY_LABELS[difficulty] ?? `难度 ${difficulty}`)
    .join('、');
  const count = Math.min(completed.length, progress.totalDiffs);
  if (count >= progress.totalDiffs) {
    return `各难度成绩已获取，正在整理…（${count}/${progress.totalDiffs}）`;
  }
  return `获取成绩中：已完成 ${completedLabels}（${count}/${progress.totalDiffs}）`;
}

export function compactUploadPhaseLabel(phase: UploadPhase): string {
  switch (phase.kind) {
    case 'logging_in':
    case 'awaiting_friend':
      return '好友申请中';
    case 'fetching_scores':
      return '获取成绩中';
    case 'uploading':
    case 'syncing':
      return '上传成绩中';
    case 'canceling':
      return '取消中';
    case 'done':
      return '上传完成';
    case 'error':
      return '上传失败';
    case 'idle':
    default:
      return '好友码';
  }
}

export function resolveUploadTargets(
  accounts: readonly BoundAccount[],
  sessionsByAccountId: Record<string, ProviderSession | undefined>,
): UploadTarget[] {
  return accounts
    .filter((account) => account.gameId === 'maimai')
    .map((account) => {
      if (account.id === LOCAL_MAIMAI_ACCOUNT_ID) {
        return {
          account,
          writable: true,
          disableReason: null,
        };
      }
      if (account.id === MAIMAI_TEST_ACCOUNT_ID || account.providerId === 'maimai-test') {
        return {
          account,
          writable: false,
          disableReason: '测试成绩由曲库自动生成',
        };
      }
      if (account.providerId === 'lxns') {
        const session = sessionsByAccountId[account.id];
        return {
          account,
          writable: session?.mode === 'lxns-oauth',
          disableReason: session?.mode === 'lxns-oauth' ? null : '请重新授权落雪账号',
        };
      }
      if (account.providerId !== 'diving-fish') {
        return {
          account,
          writable: false,
          disableReason: '不支持的查分器',
        };
      }
      const session = sessionsByAccountId[account.id];
      if (!session || session.mode !== 'import-token') {
        return {
          account,
          writable: false,
          disableReason: '请先用账密绑定水鱼账号',
        };
      }
      return { account, writable: true, disableReason: null };
    });
}

export async function uploadMaimaiFromFriendCode(input: {
  friendCode: string;
  selectedAccountIds: string[];
  targets: UploadTarget[];
  sessionsByAccountId: Record<string, ProviderSession | undefined>;
  catalog: CatalogSnapshot;
  signal: ScoreHubAbortSignal;
  onPhase: (phase: UploadPhase) => void;
  onNeedFriendAccept: (botFriendCode: string | null) => void;
  onLxnsTokensRotated?: (accountId: string, session: LxnsOAuthSession) => void | Promise<void>;
}): Promise<UploadResult> {
  const friendCode = input.friendCode.trim();
  if (!/^\d{15}$/.test(friendCode)) {
    throw new ScoreHubError('请输入 15 位好友码');
  }

  const selected = input.targets.filter(
    (target) => target.writable && input.selectedAccountIds.includes(target.account.id),
  );
  if (selected.length === 0) {
    throw new ScoreHubError('请至少勾选一个可上传的查分器');
  }
  input.onPhase({ kind: 'logging_in', message: '正在创建好友申请任务…' });
  const login = await createFriendLoginJob(friendCode, input.signal);

  let token: string;
  let friendshipJobId: string | null = null;

  if (typeof login.body.__skipAuthToken === 'string') {
    token = login.body.__skipAuthToken;
  } else {
    friendshipJobId = login.jobId;
    if (login.botFriendCode) {
      input.onPhase({
        kind: 'awaiting_friend',
        message: '等待同意好友中…',
        botFriendCode: login.botFriendCode,
      });
    }
    let alerted = false;
    token = await pollLoginUntilToken({
      jobId: login.jobId,
      signal: input.signal,
      onWaitingFriend: ({ botFriendCode }) => {
        input.onPhase({
          kind: 'awaiting_friend',
          message: '等待同意好友中…请到舞萌 NET 接受 Bot 好友申请',
          botFriendCode,
        });
        if (!alerted) {
          alerted = true;
          input.onNeedFriendAccept(botFriendCode ?? login.botFriendCode);
        }
      },
    });
  }

  input.onPhase({ kind: 'fetching_scores', message: '获取各难度成绩中…' });
  const scoreJobId = await createUpdateScoreJob(token, friendshipJobId, input.signal);
  await pollUpdateScoreUntilDone({
    token,
    jobId: scoreJobId,
    signal: input.signal,
    onProgress: ({ progress }) => {
      input.onPhase({ kind: 'fetching_scores', message: scoreProgressMessage(progress) });
    },
  });

  const sync = await fetchLatestSync(token, input.signal);
  const scores = sync?.scores ?? [];
  if (scores.length === 0) {
    throw new ScoreHubError('未获取到成绩数据');
  }

  const divingFishMapped = convertHubScoresToDivingFishRecords(
    scores,
    buildMusicTitleMap(input.catalog),
  );
  const localMapped = convertHubScoresToLocalRecords(scores, input.catalog);
  const lxnsMapped = convertHubScoresToLxnsRecords(scores, input.catalog);
  let uploadedTotal = 0;
  let skipped = 0;
  const targetResults: UploadTargetResult[] = [];
  const refreshedAccounts: { account: BoundAccount; snapshot: ScoreSnapshot }[] = [];
  const failedAccountNames: string[] = [];
  const refreshFailedAccountIds = new Set<string>();
  const uploadedDivingFishAccounts: BoundAccount[] = [];

  for (const target of selected) {
    if (input.signal.aborted) throw new ScoreHubError('已取消');
    let written = 0;
    let targetSkipped = 0;
    try {
      input.onPhase({
        kind: 'uploading',
        message: `写入${target.account.displayName}（${target.account.providerTitle}）中…`,
        providerTitle: target.account.providerTitle,
      });
      if (target.account.providerId === 'local') {
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
          id: friendCode,
          displayName: '本地玩家',
          rating: 0,
          additionalRating: 0,
          source,
        }, localMapped.records, input.catalog);
        const { SqliteSnapshotRepository } = await import('@/storage/sqlite-snapshot-repository');
        await new SqliteSnapshotRepository().save(target.account.id, snapshot);
        refreshedAccounts.push({ account: target.account, snapshot });
        written = localMapped.records.length;
      } else if (target.account.providerId === 'diving-fish') {
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
        );
        written = result.uploaded;
        uploadedDivingFishAccounts.push(target.account);
      } else if (target.account.providerId === 'lxns') {
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
          onTokensRotated: (next) => input.onLxnsTokensRotated?.(target.account.id, next),
        });
        written = result.uploaded;
        try {
          input.onPhase({
            kind: 'syncing',
            message: `成绩已上传，正在同步应用内的 ${target.account.displayName}…`,
            providerTitle: target.account.providerTitle,
          });
          const [{ LxnsScoreProvider }, { SqliteSnapshotRepository }] = await Promise.all([
            import('@/providers/lxns-score-provider'),
            import('@/storage/sqlite-snapshot-repository'),
          ]);
          const provider = new LxnsScoreProvider(result.session, (next) => (
            input.onLxnsTokensRotated?.(target.account.id, next)
          ));
          const [player, records] = await Promise.all([
            provider.getPlayer(),
            provider.getRecords(),
          ]);
          const snapshot = buildScoreSnapshot(player, records, input.catalog);
          await new SqliteSnapshotRepository().save(target.account.id, snapshot);
          refreshedAccounts.push({ account: target.account, snapshot });
        } catch {
          failedAccountNames.push(target.account.displayName);
          refreshFailedAccountIds.add(target.account.id);
        }
      }
      uploadedTotal += written;
      skipped += targetSkipped;
      targetResults.push({
        account: target.account,
        status: 'success',
        written,
        skipped: targetSkipped,
        refreshFailed: refreshFailedAccountIds.has(target.account.id),
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

  if (uploadedDivingFishAccounts.length > 0) {
    const { refreshDivingFishAccounts } = await import('@/services/refresh-diving-fish-accounts');
    const refreshResult = await refreshDivingFishAccounts({
      accounts: uploadedDivingFishAccounts,
      sessionsByAccountId: input.sessionsByAccountId,
      catalog: input.catalog,
      expectedRecords: divingFishMapped.records,
      signal: input.signal,
      onRefreshing: (account) => {
        input.onPhase({
          kind: 'syncing',
          message: `成绩已上传，正在同步应用内的 ${account.displayName}…`,
          providerTitle: account.providerTitle,
        });
      },
    });
    refreshedAccounts.push(...refreshResult.refreshed);
    for (const failed of refreshResult.failed) {
      failedAccountNames.push(failed.account.displayName);
      refreshFailedAccountIds.add(failed.account.id);
      const outcome = targetResults.find((item) => item.account.id === failed.account.id);
      if (outcome) outcome.refreshFailed = true;
    }
  }
  if (input.signal.aborted) throw new ScoreHubError('已取消');

  const failedTargets = targetResults.filter((item) => item.status === 'failed');
  if (targetResults.every((item) => item.status === 'failed')) {
    input.onPhase({
      kind: 'error',
      message: `写入失败：${failedTargets.map((item) => `${item.account.displayName}（${item.errorMessage}）`).join('、')}`,
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
      : failedAccountNames.length > 0
        ? `写入完成：${uploadedTotal} 条；${failedAccountNames.join('、')}应用内刷新失败`
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
