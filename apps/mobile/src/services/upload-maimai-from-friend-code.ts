import type { CatalogSnapshot, ScoreSnapshot } from '@/domain/models';
import type { BoundAccount } from '@/domain/bound-account';
import type { ProviderSession } from '@/providers/contracts';
import { ProviderError } from '@/providers/errors';
import {
  bindCabinetByQr,
  createFriendLoginJob,
  createUpdateScoreJob,
  fetchLatestSync,
  fetchMe,
  loginByQrUntilToken,
  pollLoginUntilToken,
  pollUpdateScoreUntilDone,
  ScoreHubError,
  type QrLoginCredential,
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
import { MAIMAI_TEST_ACCOUNT_ID } from '@/domain/bound-account';
import { uploadRecordsToLxns } from '@/services/lxns-upload';
import { buildScoreSnapshot } from '@/services/score-service';
import type { LxnsOAuthSession } from '@/providers/lxns-oauth';
import { scoreHubAccountStore } from '@/storage/score-hub-account-store';

export type UploadPhase =
  | { kind: 'idle' }
  | { kind: 'logging_in'; message: string; authMode?: 'friend_code' | 'qr' }
  | { kind: 'awaiting_friend'; message: string; botFriendCode: string | null }
  | { kind: 'fetching_scores'; message: string }
  | { kind: 'binding'; message: string }
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

export type BindCabinetResult = {
  friendCode: string;
  alreadyBound: boolean;
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

export const QR_REQUIRES_BIND_MESSAGE =
  '首次使用前请在此绑定玩家二维码。绑定需用好友码登录，建议先到「好友码」上传一次成绩。';

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
      return phase.authMode === 'qr' ? '二维码登录中' : '好友申请中';
    case 'awaiting_friend':
      return '好友申请中';
    case 'fetching_scores':
      return '获取成绩中';
    case 'binding':
      return '绑定二维码中';
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

/** 好友申请可能延迟出现，需多次刷新列表。 */
export const FRIEND_REQUEST_REFRESH_HINT =
  '好友申请发出后，可能需在“舞萌-中二公众号 → 我的记录 → 舞萌DX”多刷新几次才能看到申请。';

/** 按近一小时公开成功率给出分档提示（rate 为 0–100）。 */
export function scoreHubSuccessHint(rate: number | null, totalCount: number): string {
  if (totalCount <= 0 || rate === null || !Number.isFinite(rate)) {
    return '近一小时暂无公开任务统计，服务状态不明，可稍后再试。';
  }
  if (rate >= 100) return '近一小时同步非常畅通，可以放心上传。';
  if (rate >= 85) return '近一小时成功率良好，通常可顺利完成。';
  if (rate >= 70) return '近一小时成功率一般，可能稍慢，请耐心等待。';
  if (rate >= 50) return '近一小时成功率偏低，建议错峰或多试一次。';
  if (rate >= 30) return '近一小时成功率较差，失败概率较高，建议稍后再试。';
  return '近一小时服务很不稳定，不建议现在上传。';
}

export function formatScoreHubStatsSummary(stats: {
  totalCount: number;
  completedCount: number;
  failedCount: number;
  successRate: number;
  avgDuration: number | null;
} | null): string {
  if (!stats || stats.totalCount <= 0) {
    return '近 1 小时：暂无公开任务样本';
  }
  const rate = Number.isFinite(stats.successRate)
    ? `${stats.successRate.toFixed(stats.successRate % 1 === 0 ? 0 : 1)}%`
    : '—';
  const duration = typeof stats.avgDuration === 'number' && stats.avgDuration > 0
    ? `，平均约 ${Math.max(1, Math.round(stats.avgDuration / 1000))} 秒`
    : '';
  return `近 1 小时成功率 ${rate}（成功 ${stats.completedCount} / 失败 ${stats.failedCount} / 共 ${stats.totalCount}）${duration}`;
}

export function resolveUploadTargets(
  accounts: readonly BoundAccount[],
  sessionsByAccountId: Record<string, ProviderSession | undefined>,
): UploadTarget[] {
  return accounts
    .filter((account) => account.gameId === 'maimai')
    .map((account) => {
      if (account.providerId === 'local') {
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

type UploadCommonInput = {
  selectedAccountIds: string[];
  targets: UploadTarget[];
  sessionsByAccountId: Record<string, ProviderSession | undefined>;
  catalog: CatalogSnapshot;
  signal: ScoreHubAbortSignal;
  onPhase: (phase: UploadPhase) => void;
  onLxnsTokensRotated?: (accountId: string, session: LxnsOAuthSession) => void | Promise<void>;
};

function resolveSelectedTargets(input: UploadCommonInput): UploadTarget[] {
  const selected = input.targets.filter(
    (target) => target.writable && input.selectedAccountIds.includes(target.account.id),
  );
  if (selected.length === 0) {
    throw new ScoreHubError('请至少勾选一个可上传的查分器');
  }
  return selected;
}

async function loginScoreHubWithFriendCode(input: {
  friendCode: string;
  signal: ScoreHubAbortSignal;
  onPhase: (phase: UploadPhase) => void;
  onNeedFriendAccept: (botFriendCode: string | null) => void;
}): Promise<{ token: string; friendshipJobId: string | null }> {
  const friendCode = input.friendCode.trim();
  if (!/^\d{15}$/.test(friendCode)) {
    throw new ScoreHubError('请输入 15 位好友码');
  }

  input.onPhase({ kind: 'logging_in', message: '正在创建好友申请任务…', authMode: 'friend_code' });
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
          message: '等待同意好友中…请到“舞萌-中二公众号-我的记录-舞萌DX”接受 Bot 好友申请',
          botFriendCode,
        });
        if (!alerted) {
          alerted = true;
          input.onNeedFriendAccept(botFriendCode ?? login.botFriendCode);
        }
      },
    });
  }

  await scoreHubAccountStore.patch({
    friendCode,
    token,
  });

  return { token, friendshipJobId };
}

async function uploadMaimaiAfterScoreHubToken(input: UploadCommonInput & {
  token: string;
  friendshipJobId: string | null;
  playerIdForLocal: string;
  selected: UploadTarget[];
  persistFriendCode?: string | null;
}): Promise<UploadResult> {
  input.onPhase({ kind: 'fetching_scores', message: '获取各难度成绩中…' });
  const scoreJobId = await createUpdateScoreJob(input.token, input.friendshipJobId, input.signal);
  await pollUpdateScoreUntilDone({
    token: input.token,
    jobId: scoreJobId,
    signal: input.signal,
    onProgress: ({ progress, stage }) => {
      if (typeof stage === 'string' && stage.includes('重试')) {
        input.onPhase({ kind: 'fetching_scores', message: stage });
        return;
      }
      input.onPhase({ kind: 'fetching_scores', message: scoreProgressMessage(progress) });
    },
  });

  const sync = await fetchLatestSync(input.token, input.signal);
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

  for (const target of input.selected) {
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
          id: input.playerIdForLocal,
          displayName: target.account.displayName,
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

export async function uploadMaimaiFromFriendCode(input: UploadCommonInput & {
  friendCode: string;
  onNeedFriendAccept: (botFriendCode: string | null) => void;
}): Promise<UploadResult> {
  const friendCode = input.friendCode.trim();
  const selected = resolveSelectedTargets(input);
  const { token, friendshipJobId } = await loginScoreHubWithFriendCode({
    friendCode,
    signal: input.signal,
    onPhase: input.onPhase,
    onNeedFriendAccept: input.onNeedFriendAccept,
  });

  return uploadMaimaiAfterScoreHubToken({
    ...input,
    selected,
    token,
    friendshipJobId,
    playerIdForLocal: friendCode,
    persistFriendCode: friendCode,
  });
}

/** 独立绑定玩家二维码：好友码登录后 PUT /me/cabinet，不拉写查分器成绩。 */
export async function bindScoreHubCabinetByFriendCode(input: {
  friendCode: string;
  qrCode: string;
  signal: ScoreHubAbortSignal;
  onPhase: (phase: UploadPhase) => void;
  onNeedFriendAccept: (botFriendCode: string | null) => void;
}): Promise<BindCabinetResult> {
  const friendCode = input.friendCode.trim();
  const qrCode = input.qrCode.trim();
  if (!qrCode) {
    throw new ScoreHubError('请提供玩家二维码字符串');
  }

  const { token } = await loginScoreHubWithFriendCode({
    friendCode,
    signal: input.signal,
    onPhase: input.onPhase,
    onNeedFriendAccept: input.onNeedFriendAccept,
  });

  input.onPhase({ kind: 'binding', message: '正在绑定玩家二维码…' });
  const bind = await bindCabinetByQr(token, qrCode, input.signal);
  const me = await fetchMe(token, input.signal).catch(() => null);
  await scoreHubAccountStore.patch({
    friendCode: me?.friendCode ?? friendCode,
    hasCabinetBound: true,
    token,
  });

  input.onPhase({
    kind: 'done',
    message: bind.alreadyBound
      ? '玩家二维码此前已绑定，可直接使用神秘二维码上传'
      : '玩家二维码已绑定，之后可用神秘二维码快速上传',
    uploaded: 0,
    skipped: 0,
  });

  return {
    friendCode: me?.friendCode ?? friendCode,
    alreadyBound: bind.alreadyBound,
  };
}

export async function uploadMaimaiFromQrLogin(input: UploadCommonInput & {
  credential: QrLoginCredential;
  requireCabinetBound?: boolean;
}): Promise<UploadResult> {
  if (input.requireCabinetBound !== false) {
    const account = await scoreHubAccountStore.load();
    if (!account.hasCabinetBound) {
      throw new ScoreHubError(QR_REQUIRES_BIND_MESSAGE);
    }
  }

  const selected = resolveSelectedTargets(input);
  input.onPhase({
    kind: 'logging_in',
    message: '正在提交神秘二维码…',
    authMode: 'qr',
  });

  let login: { token: string; friendCode: string | null };
  try {
    login = await loginByQrUntilToken({
      credential: input.credential,
      signal: input.signal,
      onProgress: ({ message }) => {
        input.onPhase({ kind: 'logging_in', message, authMode: 'qr' });
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '神秘二维码登录失败';
    if (
      message.includes('好友列表')
      || message.includes('候选好友')
      || message.includes('改用好友码')
    ) {
      throw new ScoreHubError(
        `${message}。请改用好友码上传并绑定玩家二维码后再试。`,
      );
    }
    throw error;
  }

  try {
    const me = await fetchMe(login.token, input.signal);
    await scoreHubAccountStore.patch({
      friendCode: me.friendCode ?? login.friendCode ?? '',
      hasCabinetBound: me.hasCabinetUserId,
      token: login.token,
    });
  } catch {
    if (login.friendCode) {
      await scoreHubAccountStore.patch({
        friendCode: login.friendCode,
        token: login.token,
      });
    }
  }

  const fallbackPlayerId = selected.find((target) => target.account.providerId === 'local')?.account.id
    ?? selected[0]!.account.id;

  return uploadMaimaiAfterScoreHubToken({
    ...input,
    selected,
    token: login.token,
    friendshipJobId: null,
    playerIdForLocal: login.friendCode ?? fallbackPlayerId,
    persistFriendCode: login.friendCode,
  });
}
