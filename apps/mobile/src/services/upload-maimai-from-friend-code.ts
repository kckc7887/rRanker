import type { BoundAccount } from '@/domain/bound-account';
import { MAIMAI_TEST_ACCOUNT_ID } from '@/domain/bound-account';
import { SessionPersistenceError } from '@/domain/session-vault';
import type { ProviderSession } from '@/providers/contracts';
import {
  fetchMe,
  loginByQrUntilToken,
  ScoreHubError,
  type QrLoginCredential,
} from '@/services/score-hub-client';
import { captureAccountWrites } from '@/services/snapshot-cache-utils';
import { loginScoreHubWithFriendCode } from '@/services/upload-maimai-login';
import { uploadMaimaiAfterScoreHubToken } from '@/services/upload-maimai-score-fetch';
import { uploadMaimaiScoresToTargets } from '@/services/upload-maimai-target-write';
import type { UploadCommonInput, UploadPhase, UploadResult, UploadTarget } from '@/services/upload-maimai-types';
import { scoreHubAccountStore } from '@/storage/score-hub-account-store';
export type { UploadCommonInput, UploadPhase, UploadResult, UploadTarget, UploadTargetResult, UploadTaskSnapshot } from '@/services/upload-maimai-types';

export { scoreProgressMessage } from '@/services/upload-maimai-score-fetch';

export function compactUploadPhaseLabel(phase: UploadPhase): string {
  switch (phase.kind) {
    case 'logging_in':
      if (phase.authMode === 'qr') return '确认二维码中';
      if (phase.authMode === 'session') return '获取成绩中';
      return '创建任务中';
    case 'sending_friend':
      return '发送申请中';
    case 'awaiting_friend':
      return '等待同意中';
    case 'fetching_scores':
      return '获取成绩中';
    case 'syncing_catalog':
    case 'awaiting_catalog':
      return '同步曲库中';
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

/** 好友申请可能延迟出现，需重读列表。 */
export const FRIEND_REQUEST_REFRESH_HINT =
  '好友申请发出后，可能需在“舞萌-中二公众号 → 我的记录 → 舞萌DX”多刷新几次才能看到申请。';

/** rate 单位为百分比。 */
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

function resolveSelectedTargets(input: UploadCommonInput): UploadTarget[] {
  const selected = input.targets.filter(
    (target) => target.writable && input.selectedAccountIds.includes(target.account.id),
  );
  if (selected.length === 0) {
    throw new ScoreHubError('请至少勾选一个可上传的查分器');
  }
  return selected;
}

export function isScoreHubAuthExpired(error: unknown): boolean {
  return error instanceof ScoreHubError
    && (error.status === 401 || error.status === 403);
}

export async function uploadMaimaiFromFriendCode(input: UploadCommonInput & {
  friendCode: string;
  onNeedFriendAccept: (botFriendCode: string | null) => void;
}): Promise<UploadResult> {
  const friendCode = input.friendCode.trim();
  const selected = resolveSelectedTargets(input);
  const assertAccount = captureAccountWrites(selected.map((target) => target.account));
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
    assertAccount,
  });
}

export async function uploadMaimaiWithScoreHubSession(input: UploadCommonInput & {
  expectedFriendCode?: string | null;
}): Promise<UploadResult> {
  const selected = resolveSelectedTargets(input);
  const assertAccount = captureAccountWrites(selected.map((target) => target.account));
  input.onPhase({
    kind: 'logging_in',
    message: '正在使用已登录的 ScoreHub 会话…',
    authMode: 'session',
  });

  const expected = input.expectedFriendCode?.trim() ?? '';
  const entry = expected
    ? await scoreHubAccountStore.getByFriendCode(expected)
    : null;
  const cached = entry
    ? {
      friendCode: entry.friendCode,
      token: entry.token,
      hasCabinetBound: entry.hasCabinetBound,
    }
    : await scoreHubAccountStore.load();

  if (!cached.token) {
    throw new ScoreHubError(
      '尚未登录 ScoreHub。请先完成一次好友码上传登录，再回来拉取成绩。',
      401,
    );
  }

  if (expected && cached.friendCode && expected !== cached.friendCode) {
    throw new ScoreHubError(
      '好友码与当前登录会话不一致，请重新用该好友码登录后再试。',
    );
  }

  let friendCode = cached.friendCode || expected;
  try {
    const me = await fetchMe(cached.token, input.signal);
    friendCode = me.friendCode ?? friendCode;
    await scoreHubAccountStore.upsert({
      friendCode,
      hasCabinetBound: me.hasCabinetUserId || cached.hasCabinetBound,
      token: cached.token,
    });
  } catch (error) {
    if (error instanceof SessionPersistenceError) throw error;
    if (isScoreHubAuthExpired(error)) {
      throw new ScoreHubError(
        '登录已失效。将改用好友码重新登录。',
        error instanceof ScoreHubError ? error.status : 401,
      );
    }
  }

  if (!friendCode) {
    throw new ScoreHubError(
      '本地会话缺少好友码。请先完成一次好友码上传登录。',
      401,
    );
  }

  try {
    return await uploadMaimaiAfterScoreHubToken({
      ...input,
      selected,
      token: cached.token,
      friendshipJobId: null,
      playerIdForLocal: friendCode,
      persistFriendCode: friendCode,
      assertAccount,
    });
  } catch (error) {
    if (isScoreHubAuthExpired(error)) {
      throw new ScoreHubError(
        '登录已失效。将改用好友码重新登录。',
        error instanceof ScoreHubError ? error.status : 401,
      );
    }
    throw error;
  }
}

export async function uploadMaimaiPreferringSession(input: UploadCommonInput & {
  friendCode: string;
  preferSession: boolean;
  onNeedFriendAccept: (botFriendCode: string | null) => void;
}): Promise<UploadResult> {
  if (input.preferSession) {
    try {
      return await uploadMaimaiWithScoreHubSession({
        ...input,
        expectedFriendCode: input.friendCode.trim(),
      });
    } catch (error) {
      if (input.signal.aborted) throw error;
      if (!isScoreHubAuthExpired(error)) throw error;
      input.onPhase({
        kind: 'logging_in',
        message: '会话已失效，改用好友码重新登录…',
        authMode: 'friend_code',
      });
    }
  }
  return uploadMaimaiFromFriendCode(input);
}

export async function uploadMaimaiWithScoreHubQr(input: UploadCommonInput & {
  credential: QrLoginCredential;
  onQrAccepted?: () => void;
  onAccountBound: (friendCode: string) => Promise<void>;
}): Promise<UploadResult> {
  const selected = resolveSelectedTargets(input);
  const assertAccount = captureAccountWrites(selected.map((target) => target.account));
  input.onPhase({ kind: 'logging_in', message: '正在确认玩家二维码…', authMode: 'qr' });
  const login = await loginByQrUntilToken({ credential: input.credential, signal: input.signal });
  input.onQrAccepted?.();
  const me = await fetchMe(login.token, input.signal);
  const friendCode = me.friendCode ?? login.friendCode;
  if (!friendCode || !me.hasCabinetUserId) {
    throw new ScoreHubError('绑定失败', undefined, false, { code: 'CABINET_NOT_BOUND' });
  }
  if (input.signal.aborted) throw new ScoreHubError('已取消');
  await scoreHubAccountStore.upsert({ friendCode, hasCabinetBound: true, token: login.token });
  if (input.signal.aborted) throw new ScoreHubError('已取消');
  await input.onAccountBound(friendCode);
  if (input.signal.aborted) throw new ScoreHubError('已取消');
  return uploadMaimaiAfterScoreHubToken({ ...input, selected, token: login.token,
    friendshipJobId: null, playerIdForLocal: friendCode, assertAccount });
}

export async function uploadMaimaiFromQrLogin(input: UploadCommonInput & {
  credential: QrLoginCredential;
  onQrAccepted?: () => void;
}): Promise<UploadResult> {
  const selected = resolveSelectedTargets(input);
  const assertAccount = captureAccountWrites(selected.map((target) => target.account));
  if (input.credential.kind !== 'text') {
    throw new ScoreHubError('二维码无效', undefined, false, { code: 'INVALID_QR' });
  }
  const { readMaimaiSave } = await import('@/services/maimai-save');
  await input.signal.waitUntilResumed?.();
  if (input.signal.aborted) throw new ScoreHubError('已取消');
  input.onPhase({ kind: 'fetching_scores', message: '正在读取成绩…' });
  const pending = readMaimaiSave(input.credential.qrCode);
  input.onQrAccepted?.();
  const { scores, courseRank } = await pending;
  if (input.signal.aborted) throw new ScoreHubError('已取消');
  return uploadMaimaiScoresToTargets({ ...input, selected, scores, courseRank,
    playerIdForLocal: selected.find(target => target.account.providerId === 'local')?.account.id ?? selected[0]!.account.id,
    assertAccount });
}
