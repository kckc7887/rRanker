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
} from '@/services/score-hub-sync-map';
import { LOCAL_MAIMAI_ACCOUNT_ID } from '@/domain/bound-account';

export type UploadPhase =
  | { kind: 'idle' }
  | { kind: 'logging_in'; message: string }
  | { kind: 'awaiting_friend'; message: string; botFriendCode: string | null }
  | { kind: 'fetching_scores'; message: string }
  | { kind: 'uploading'; message: string; providerTitle: string }
  | { kind: 'syncing'; message: string; providerTitle: string }
  | { kind: 'done'; message: string; uploaded: number; skipped: number }
  | { kind: 'error'; message: string };

export type UploadResult = {
  uploaded: number;
  skipped: number;
  refreshedAccounts: { account: BoundAccount; snapshot: ScoreSnapshot }[];
  failedAccountNames: string[];
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
          writable: false,
          disableReason: '本地预览不可上传',
        };
      }
      if (account.providerId === 'lxns') {
        return {
          account,
          writable: false,
          disableReason: '落雪上传尚未实现',
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
  const missingToken = selected.find((target) => {
    const session = input.sessionsByAccountId[target.account.id];
    return !session || session.mode !== 'import-token';
  });
  if (missingToken) {
    throw new ProviderError('authentication', '上传需要 Import-Token', false);
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

  const titleMap = buildMusicTitleMap(input.catalog);
  const mapped = convertHubScoresToDivingFishRecords(scores, titleMap);
  if (mapped.records.length === 0) {
    throw new ScoreHubError(
      `成绩无法匹配曲名（跳过无曲名 ${mapped.skippedNoTitle}、无效达成率 ${mapped.skippedBadScore}）`,
    );
  }

  let uploadedTotal = 0;
  for (const target of selected) {
    if (input.signal.aborted) throw new ScoreHubError('已取消');
    if (target.account.providerId !== 'diving-fish') continue;
    const session = input.sessionsByAccountId[target.account.id];
    if (!session || session.mode !== 'import-token') continue;
    input.onPhase({
      kind: 'uploading',
      message: `上传${target.account.displayName}（${target.account.providerTitle}）中…`,
      providerTitle: target.account.providerTitle,
    });
    const result = await uploadRecordsToDivingFish(session.value, mapped.records);
    uploadedTotal += result.uploaded;
  }

  const skipped = mapped.skippedNoTitle + mapped.skippedBadScore;
  const { refreshDivingFishAccounts } = await import('@/services/refresh-diving-fish-accounts');
  const refreshResult = await refreshDivingFishAccounts({
    accounts: selected.map((target) => target.account),
    sessionsByAccountId: input.sessionsByAccountId,
    catalog: input.catalog,
    expectedRecords: mapped.records,
    signal: input.signal,
    onRefreshing: (account) => {
      input.onPhase({
        kind: 'syncing',
        message: `成绩已上传，正在同步应用内的 ${account.displayName}…`,
        providerTitle: account.providerTitle,
      });
    },
  });
  const failedAccountNames = refreshResult.failed.map((item) => item.account.displayName);
  if (failedAccountNames.length > 0) {
    input.onPhase({
      kind: 'error',
      message: `成绩已上传，但应用内账号同步失败：${failedAccountNames.join('、')}。请稍后点“同步数据”重试。`,
    });
    return {
      uploaded: uploadedTotal,
      skipped,
      refreshedAccounts: refreshResult.refreshed,
      failedAccountNames,
    };
  }
  input.onPhase({
    kind: 'done',
    message: skipped > 0
      ? `完成：上传 ${uploadedTotal} 条，跳过 ${skipped} 条`
      : `完成：上传 ${uploadedTotal} 条`,
    uploaded: uploadedTotal,
    skipped,
  });
  return {
    uploaded: uploadedTotal,
    skipped,
    refreshedAccounts: refreshResult.refreshed,
    failedAccountNames,
  };
}
