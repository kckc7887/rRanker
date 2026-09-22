import {
  requestScoreHubJson as requestJson,
  requestScoreHubRaw as requestRaw,
  ScoreHubError,
  type ScoreHubAbortSignal,
} from '@/services/score-hub-http';
import { pollQrLoginUntilToken } from '@/services/score-hub-poll';
import {
  friendCodeFromUser,
  QR_LOGIN_STATUS_LABEL,
  SCORE_HUB_ALL_DIFFICULTIES,
  type QrLoginCredential,
  type QrLoginTokenResult,
  type ScoreHubDxnetJobStats,
  type ScoreHubLatestSync,
  type ScoreHubStatistics,
} from '@/services/score-hub-types';

export {
  isRetryableScoreHubError,
  SCORE_HUB_API_BASE,
  ScoreHubError,
  type ScoreHubAbortSignal,
} from '@/services/score-hub-http';
export {
  pollCabinetScoreJobUntilDone,
  pollLoginUntilToken,
  pollQrLoginUntilToken,
  pollUpdateScoreUntilDone,
  verifyLoginJob,
} from '@/services/score-hub-poll';
export {
  createCabinetScoreJob,
  fetchActiveCabinetScoreJob,
  fetchCabinetScoreJob,
} from '@/services/score-hub-cabinet';
export {
  friendCodeFromUser,
  QR_LOGIN_STATUS_LABEL,
  SCORE_HUB_ALL_DIFFICULTIES,
} from '@/services/score-hub-types';
export type {
  QrLoginCredential,
  QrLoginTokenResult,
  ScoreHubCabinetScoreJob,
  ScoreHubCabinetScoreJobCleanupStatus,
  ScoreHubCabinetScoreJobError,
  ScoreHubCabinetScoreJobStage,
  ScoreHubCabinetScoreJobStatus,
  ScoreHubDxnetJobStats,
  ScoreHubLatestSync,
  ScoreHubScoreProgress,
  ScoreHubStatistics,
  ScoreHubSyncScore,
} from '@/services/score-hub-types';

const QR_LOGIN_POST_TIMEOUT_MS = 150_000;


export function scoreHubErrorToUserMessage(
  error: unknown,
  fallback: string,
): string {
  if (!(error instanceof ScoreHubError)) return fallback;
  switch (error.code) {
    case 'QR_INPUT_REQUIRED':
      return '请粘贴或识别公众号玩家二维码后再试。';
    case 'QR_IMAGE_DECODE_FAILED':
    case 'QR_IMAGE_UNSUPPORTED':
      return '无法识别这张二维码图片，请换一张清晰截图重试。';
    case 'QR_EXPIRED':
      return '玩家二维码已失效，请在公众号重新打开后重试。';
    case 'CABINET_NOT_BOUND':
      return '暂时无法确认玩家账号，请刷新玩家二维码后重试。';
    case 'CABINET_USER_MISMATCH':
      return '玩家二维码与当前账号不一致，请使用本人的二维码重试。';
    case 'SYNC_IN_PROGRESS':
    case 'SESSION_CLEANUP_PENDING':
      return '已有一次成绩读取正在进行，请等待完成后再试。';
    case 'SESSION_CLEANUP_UNCONFIRMED':
    case 'ACCOUNT_ALREADY_LOGGED_IN':
      return '当前账号暂时无法读取成绩，请稍后使用新的玩家二维码重试。';
    case 'WORKER_INTERRUPTED_SESSION_CLEANED':
    case 'QR_LOGIN_FAILED':
      return '本次读取未完成，请使用新的玩家二维码重试。';
    case 'NO_SCORE_DATA':
      return '没有读取到可用成绩，请确认账号后使用新的玩家二维码重试。';
    case 'SYNC_PERSIST_FAILED':
    case 'CABINET_SCORE_JOB_FAILED':
      return '成绩暂时无法保存，请稍后重试。';
    default:
      if (error.status === 401 || error.status === 403) {
        return '登录已失效，请重新输入好友码或玩家二维码。';
      }
      if (error.retryable) {
        return '网络连接不稳定，请检查网络后重试。';
      }
      return fallback;
  }
}


function qrLoginErrorMessage(body: unknown, status: number): string {
  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>;
    const message = record.message;
    if (typeof message === 'object' && message && typeof (message as { message?: unknown }).message === 'string') {
      return String((message as { message: string }).message);
    }
    if (typeof message === 'string' && message && message !== 'Bad Request') {
      return message;
    }
    if (typeof record.error === 'string' && record.error) {
      return record.error;
    }
  }
  return `神秘二维码登录失败（HTTP ${status}）`;
}

export function isQrExpiredErrorBody(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false;
  const message = (body as { message?: unknown }).message;
  if (typeof message === 'object' && message && (message as { code?: unknown }).code === 'qr_expired') {
    return true;
  }
  return (body as { code?: unknown }).code === 'qr_expired';
}

export type QrLoginInitResult =
  | { kind: 'fast'; token: string; friendCode: string | null }
  | { kind: 'async'; attemptId: string };

export function parseQrLoginInitBody(status: number, body: unknown): QrLoginInitResult {
  if ((status === 200 || status === 201) && body && typeof body === 'object') {
    const record = body as Record<string, unknown>;
    if (record.kind === 'fast' && typeof record.token === 'string' && record.token) {
      return { kind: 'fast', token: record.token, friendCode: friendCodeFromUser(record.user) };
    }
    if (record.kind === 'async' && typeof record.attemptId === 'string' && record.attemptId) {
      return { kind: 'async', attemptId: record.attemptId };
    }
    // 兼容旧版直接返回 token
    if (typeof record.token === 'string' && record.token) {
      return { kind: 'fast', token: record.token, friendCode: friendCodeFromUser(record.user) };
    }
  }
  if (isQrExpiredErrorBody(body)) {
    throw new ScoreHubError(
      '玩家二维码已过期',
      status,
      false,
      { code: 'QR_EXPIRED' },
    );
  }
  throw new ScoreHubError(qrLoginErrorMessage(body, status), status);
}


export async function createFriendLoginJob(
  friendCode: string,
  signal?: ScoreHubAbortSignal,
): Promise<{ jobId: string; botFriendCode: string | null; body: Record<string, unknown> }> {
  const { status, body } = await requestJson('POST', '/auth/login-requests', {
    body: { friendCode, method: 'bot_sends_request' },
    signal,
  });
  if (status === 201 && body && typeof body === 'object') {
    const record = body as Record<string, unknown>;
    if (record.skipAuth && typeof record.token === 'string') {
      return { jobId: '', botFriendCode: null, body: { ...record, __skipAuthToken: record.token } };
    }
    if (typeof record.jobId === 'string') {
      const job = record.job && typeof record.job === 'object' ? (record.job as Record<string, unknown>) : {};
      const bot =
        (typeof record.botFriendCode === 'string' && record.botFriendCode)
        || (typeof job.botUserFriendCode === 'string' && job.botUserFriendCode)
        || null;
      return { jobId: record.jobId, botFriendCode: bot, body: record };
    }
  }
  throw new ScoreHubError(`创建登录失败（HTTP ${status}）`, status);
}

/** 公众号玩家二维码登录：提交文本或图片，返回快路径 token 或慢路径 attemptId。 */
export async function loginByQr(
  credential: QrLoginCredential,
  signal?: ScoreHubAbortSignal,
): Promise<QrLoginInitResult> {
  if (credential.kind === 'text') {
    const qrCode = credential.qrCode.trim();
    if (!qrCode) {
      throw new ScoreHubError('请粘贴神秘二维码字符串');
    }
    const { status, body } = await requestJson('POST', '/auth/qr-login', {
      body: { qrCode },
      signal,
      timeoutMs: QR_LOGIN_POST_TIMEOUT_MS,
    });
    return parseQrLoginInitBody(status, body);
  }

  const formData = new FormData();
  const fileName = credential.fileName?.trim() || 'qr.jpg';
  const mimeType = credential.mimeType?.trim() || 'image/jpeg';
  formData.append('image', {
    uri: credential.imageUri,
    name: fileName,
    type: mimeType,
  } as unknown as Blob);

  const { status, body } = await requestRaw('POST', '/auth/qr-login', {
    formData,
    signal,
    timeoutMs: QR_LOGIN_POST_TIMEOUT_MS,
  });
  return parseQrLoginInitBody(status, body);
}


/** 完整二维码登录：提交凭证并在需要时轮询慢路径，最终返回 token。 */
export async function loginByQrUntilToken(input: {
  credential: QrLoginCredential;
  signal?: ScoreHubAbortSignal;
  onProgress?: (info: { status: string; message: string }) => void;
}): Promise<QrLoginTokenResult> {
  input.onProgress?.({ status: 'pending', message: '正在确认玩家二维码…' });
  const init = await loginByQr(input.credential, input.signal);
  if (init.kind === 'fast') {
    return { token: init.token, friendCode: init.friendCode };
  }
  input.onProgress?.({ status: 'pending', message: QR_LOGIN_STATUS_LABEL.pending });
  return pollQrLoginUntilToken({
    attemptId: init.attemptId,
    signal: input.signal,
    onProgress: input.onProgress,
  });
}


export async function createUpdateScoreJob(
  token: string,
  friendshipJobId: string | null,
  signal?: ScoreHubAbortSignal,
): Promise<string> {
  const body: {
    jobType: string;
    diffsToScrape: number[];
    friendshipJobId?: string;
  } = {
    jobType: 'update_score',
    diffsToScrape: [...SCORE_HUB_ALL_DIFFICULTIES],
  };
  if (friendshipJobId) body.friendshipJobId = friendshipJobId;
  const { status, body: payload } = await requestJson('POST', '/me/dxnet-jobs', {
    body,
    token,
    signal,
  });
  if (status === 400 && payload && typeof payload === 'object') {
    const code = (payload as { code?: string }).code;
    if (code === 'needs_friendship') {
      throw new ScoreHubError('尚未与 Bot 成为好友，请先完成好友申请', status);
    }
  }
  if ((status === 200 || status === 201) && payload && typeof payload === 'object') {
    const jobId = (payload as { jobId?: string }).jobId;
    if (typeof jobId === 'string') return jobId;
  }
  throw new ScoreHubError(`创建成绩任务失败（HTTP ${status}）`, status);
}




export async function fetchLatestSync(
  token: string,
  signal?: ScoreHubAbortSignal,
): Promise<ScoreHubLatestSync> {
  const { status, body } = await requestJson('GET', '/me/sync/latest', { token, signal });
  if (status !== 200) {
    throw new ScoreHubError(`拉取 sync 失败（HTTP ${status}）`, status);
  }
  if (body === null) return null;
  if (!body || typeof body !== 'object') {
    throw new ScoreHubError('sync 响应无效');
  }
  return body as ScoreHubLatestSync;
}

export type ScoreHubMeProfile = {
  friendCode: string | null;
  hasCabinetUserId: boolean;
};

export async function fetchMe(
  token: string,
  signal?: ScoreHubAbortSignal,
): Promise<ScoreHubMeProfile> {
  const { status, body } = await requestJson('GET', '/me', { token, signal });
  if (status !== 200 || !body || typeof body !== 'object') {
    throw new ScoreHubError(`拉取账号信息失败（HTTP ${status}）`, status);
  }
  const record = body as Record<string, unknown>;
  return {
    friendCode: typeof record.friendCode === 'string' ? record.friendCode : null,
    hasCabinetUserId: record.hasCabinetUserId === true,
  };
}

function bindCabinetErrorMessage(body: unknown, status: number): string {
  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>;
    if (status === 409) {
      if (record.verification === 'profile') {
        return '二维码反查出的好友码与当前登录账号不一致，请确认使用本人的玩家二维码';
      }
      const matched = typeof record.matchedRows === 'number' ? record.matchedRows : 0;
      const required = typeof record.requiredRows === 'number' ? record.requiredRows : 10;
      return `绑定失败：成绩匹配 ${matched}/${required} 条，请先完成成绩同步后再试`;
    }
    const message = record.message;
    if (typeof message === 'string' && message && message !== 'Bad Request') {
      return message;
    }
    if (typeof record.error === 'string' && record.error) {
      return record.error;
    }
  }
  return `绑定玩家二维码失败（HTTP ${status}）`;
}

export type BindCabinetResult = {
  ok: true;
  alreadyBound: boolean;
};

/** 已登录用户绑定玩家二维码（PUT /me/cabinet）。已绑定视为成功。 */
export async function bindCabinetByQr(
  token: string,
  qrCode: string,
  signal?: ScoreHubAbortSignal,
): Promise<BindCabinetResult> {
  const trimmed = qrCode.trim();
  if (!trimmed) {
    throw new ScoreHubError('请提供玩家二维码字符串');
  }
  const { status, body } = await requestJson('PUT', '/me/cabinet', {
    body: { qrCode: trimmed },
    token,
    signal,
    timeoutMs: QR_LOGIN_POST_TIMEOUT_MS,
  });
  if (status === 201) {
    return { ok: true, alreadyBound: false };
  }
  if (status === 400 && body && typeof body === 'object') {
    const message = String(
      (body as { message?: unknown }).message
      ?? (body as { error?: unknown }).error
      ?? '',
    );
    if (message.includes('已绑定')) {
      return { ok: true, alreadyBound: true };
    }
  }
  throw new ScoreHubError(bindCabinetErrorMessage(body, status), status);
}

function parseDxnetJobStats(raw: unknown): ScoreHubDxnetJobStats | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  if (typeof record.totalCount !== 'number'
    || typeof record.completedCount !== 'number'
    || typeof record.failedCount !== 'number'
    || typeof record.successRate !== 'number') {
    return null;
  }
  return {
    totalCount: record.totalCount,
    completedCount: record.completedCount,
    failedCount: record.failedCount,
    successRate: record.successRate,
    avgDuration: typeof record.avgDuration === 'number' ? record.avgDuration : null,
  };
}

/** 公开接口：近一小时 DXNet update_score 任务统计。 */
export async function fetchScoreHubStatistics(
  signal?: ScoreHubAbortSignal,
): Promise<ScoreHubStatistics> {
  const { status, body } = await requestJson('GET', '/statistics', { signal });
  if (status !== 200 || !body || typeof body !== 'object') {
    throw new ScoreHubError(`拉取服务统计失败（HTTP ${status}）`, status, true);
  }
  const dxnetJobs = parseDxnetJobStats((body as Record<string, unknown>).dxnetJobs);
  if (!dxnetJobs) {
    throw new ScoreHubError('服务统计响应无效', status, true);
  }
  return { dxnetJobs };
}
