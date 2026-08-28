import { fetch as expoFetch } from 'expo/fetch';

export const SCORE_HUB_API_BASE = 'https://api.maiscorehub.bakapiano.com/api/v1';

const LOGIN_POLL_MS = 3_000;
const SCORE_POLL_MS = 5_000;
const LOGIN_TIMEOUT_MS = 8 * 60_000;
const SCORE_TIMEOUT_MS = 20 * 60_000;
const VERIFY_EVERY_MS = 20_000;
const REQUEST_TIMEOUT_MS = 60_000;
const QR_LOGIN_POST_TIMEOUT_MS = 150_000;
const QR_POLL_MS = 1_000;
const QR_LOGIN_TIMEOUT_MS = 5 * 60_000;
const CABINET_SCORE_POLL_MS = 1_000;
const CABINET_SCORE_TIMEOUT_MS = 30 * 60_000;
const CABINET_SCORE_FAILURE_LIMIT = 5;

export const SCORE_HUB_ALL_DIFFICULTIES = [0, 1, 2, 3, 4, 10] as const;

export const QR_LOGIN_STATUS_LABEL: Record<string, string> = {
  pending: '正在准备读取…',
  adding_rival: '正在确认玩家信息…',
  waiting_snapshot: '正在确认玩家账号…',
};

export type QrLoginCredential =
  | { kind: 'text'; qrCode: string }
  | { kind: 'image'; imageUri: string; mimeType?: string; fileName?: string };

export type QrLoginTokenResult = {
  token: string;
  friendCode: string | null;
};

export type ScoreHubSyncScore = {
  musicId: string;
  cid?: string;
  chartIndex: number;
  type: string;
  dxScore?: string | number | null;
  score?: string | number | null;
  fs?: string | null;
  fc?: string | null;
  rating?: number;
  isNew?: boolean;
};

export type ScoreHubLatestSync = {
  id: string;
  createdAt?: string;
  updatedAt?: string;
  scores?: ScoreHubSyncScore[];
  autoExportResult?: unknown;
} | null;

export type ScoreHubScoreProgress = {
  completedDiffs: number[];
  totalDiffs: number;
};

export type ScoreHubDxnetJobStats = {
  totalCount: number;
  completedCount: number;
  failedCount: number;
  successRate: number;
  avgDuration: number | null;
};

export type ScoreHubStatistics = {
  dxnetJobs: ScoreHubDxnetJobStats;
};

export type ScoreHubCabinetScoreJobStatus = 'queued' | 'processing' | 'completed' | 'failed';
export type ScoreHubCabinetScoreJobCleanupStatus =
  | 'not_required'
  | 'pending'
  | 'succeeded'
  | 'unconfirmed';
export type ScoreHubCabinetScoreJobStage =
  | 'queued'
  | 'qr_auth'
  | 'preview'
  | 'login'
  | 'get_music'
  | 'logout'
  | 'cleanup'
  | 'persist';
export type ScoreHubCabinetScoreJobError = {
  code: string;
  retryAfter: string | null;
};
export type ScoreHubCabinetScoreJob = {
  id: string;
  status: ScoreHubCabinetScoreJobStatus;
  stage: ScoreHubCabinetScoreJobStage;
  cleanupStatus: ScoreHubCabinetScoreJobCleanupStatus;
  progress: { detailsFetched: number } | null;
  syncId: string | null;
  scoreCount: number | null;
  error: ScoreHubCabinetScoreJobError | null;
  createdAt: string;
  updatedAt: string;
};

export class ScoreHubError extends Error {
  readonly status?: number;
  readonly retryable: boolean;
  readonly code?: string;
  readonly retryAfter?: string;

  constructor(
    message: string,
    status?: number,
    retryable = false,
    details?: { code?: string; retryAfter?: string },
  ) {
    super(message);
    this.name = 'ScoreHubError';
    this.status = status;
    this.retryable = retryable;
    this.code = details?.code;
    this.retryAfter = details?.retryAfter;
  }
}

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

export type ScoreHubAbortSignal = {
  aborted: boolean;
  paused?: boolean;
  waitUntilResumed?: () => Promise<void>;
  onCancel?: (listener: () => void) => () => void;
};

function normalizeNetworkErrorMessage(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes('terminated') || lower.includes('connection') || lower.includes('network')) {
    return '网络连接中断，正在重试…';
  }
  if (lower.includes('timeout') || lower.includes('timed out') || lower.includes('aborted')) {
    return 'score-hub 请求超时，正在重试…';
  }
  return raw;
}

/** 轮询期间可恢复的瞬时错误（单次请求失败不应直接终止整次拉成绩）。 */
export function isRetryableScoreHubError(error: unknown): boolean {
  if (error instanceof ScoreHubError) {
    if (error.message === '已取消') return false;
    if (error.retryable) return true;
    const lower = error.message.toLowerCase();
    return lower.includes('超时')
      || lower.includes('中断')
      || lower.includes('无法连接')
      || lower.includes('terminated')
      || lower.includes('fetch failed')
      || lower.includes('network');
  }
  if (error instanceof Error) {
    const lower = error.message.toLowerCase();
    return lower.includes('terminated')
      || lower.includes('fetch failed')
      || lower.includes('network')
      || lower.includes('timeout')
      || lower.includes('aborted')
      || error.name === 'AbortError'
      || error.name === 'FetchError';
  }
  return false;
}

async function requestRaw(
  method: string,
  path: string,
  options?: {
    jsonBody?: unknown;
    formData?: FormData;
    token?: string;
    signal?: ScoreHubAbortSignal;
    timeoutMs?: number;
  },
): Promise<{ status: number; body: unknown }> {
  await options?.signal?.waitUntilResumed?.();
  if (options?.signal?.aborted) {
    throw new ScoreHubError('已取消');
  }
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'User-Agent': 'rRanker-mobile/1.0',
  };
  if (options?.jsonBody !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (options?.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }
  const controller = new AbortController();
  let timedOut = false;
  const timeoutMs = options?.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const abortWatch = options?.signal ? setInterval(() => {
    if (options.signal?.aborted) controller.abort();
  }, 100) : null;
  try {
    const response = await expoFetch(`${SCORE_HUB_API_BASE}${path}`, {
      method,
      headers,
      body: options?.formData !== undefined
        ? options.formData
        : options?.jsonBody === undefined
          ? undefined
          : JSON.stringify(options.jsonBody),
      signal: controller.signal,
    });
    const text = await response.text();
    let body: unknown = null;
    if (text) {
      try {
        body = JSON.parse(text) as unknown;
      } catch {
        body = { error: text };
      }
    }
    return { status: response.status, body };
  } catch (error) {
    if (options?.signal?.aborted && !timedOut) throw new ScoreHubError('已取消');
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ScoreHubError(
        timedOut ? 'score-hub 请求超时，正在重试…' : '已取消',
        undefined,
        timedOut,
      );
    }
    const raw = error instanceof Error ? error.message : '无法连接 score-hub';
    throw new ScoreHubError(normalizeNetworkErrorMessage(raw), undefined, true);
  } finally {
    clearTimeout(timeout);
    if (abortWatch !== null) clearInterval(abortWatch);
  }
}

async function requestJson(
  method: string,
  path: string,
  options?: {
    body?: unknown;
    token?: string;
    signal?: ScoreHubAbortSignal;
    timeoutMs?: number;
  },
): Promise<{ status: number; body: unknown }> {
  return requestRaw(method, path, {
    jsonBody: options?.body,
    token: options?.token,
    signal: options?.signal,
    timeoutMs: options?.timeoutMs,
  });
}

function friendCodeFromUser(user: unknown): string | null {
  if (!user || typeof user !== 'object') return null;
  const friendCode = (user as { friendCode?: unknown }).friendCode;
  return typeof friendCode === 'string' && friendCode.trim() ? friendCode.trim() : null;
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

function sleep(ms: number, signal?: ScoreHubAbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new ScoreHubError('已取消'));
      return;
    }
    const timer = setTimeout(() => {
      if (signal?.aborted) reject(new ScoreHubError('已取消'));
      else if (signal?.waitUntilResumed) void signal.waitUntilResumed().then(resolve, reject);
      else resolve();
    }, ms);
    if (signal) {
      const watch = setInterval(() => {
        if (signal.aborted) {
          clearTimeout(timer);
          clearInterval(watch);
          reject(new ScoreHubError('已取消'));
        }
      }, 250);
      setTimeout(() => clearInterval(watch), ms + 10);
    }
  });
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

export async function verifyLoginJob(jobId: string, signal?: ScoreHubAbortSignal): Promise<void> {
  await requestJson('POST', `/auth/login-requests/${encodeURIComponent(jobId)}/verify`, { signal });
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

export async function pollQrLoginUntilToken(input: {
  attemptId: string;
  signal?: ScoreHubAbortSignal;
  onProgress?: (info: { status: string; message: string }) => void;
}): Promise<QrLoginTokenResult> {
  const deadline = Date.now() + QR_LOGIN_TIMEOUT_MS;
  let consecutiveFailures = 0;

  while (Date.now() < deadline) {
    if (input.signal?.aborted) throw new ScoreHubError('已取消');
    let status: number;
    let body: unknown;
    try {
      ({ status, body } = await requestJson(
        'GET',
        `/auth/qr-login/${encodeURIComponent(input.attemptId)}`,
        { signal: input.signal },
      ));
      consecutiveFailures = 0;
    } catch (error) {
      if (!isRetryableScoreHubError(error)) throw error;
      consecutiveFailures += 1;
      if (consecutiveFailures >= 5) {
        throw error instanceof ScoreHubError
          ? error
          : new ScoreHubError('神秘二维码登录网络异常，请稍后重试');
      }
      await sleep(QR_POLL_MS * consecutiveFailures, input.signal);
      continue;
    }

    if (status !== 200 || !body || typeof body !== 'object') {
      await sleep(QR_POLL_MS, input.signal);
      continue;
    }

    const record = body as Record<string, unknown>;
    const attemptStatus = String(record.status ?? 'pending');
    const label = QR_LOGIN_STATUS_LABEL[attemptStatus] ?? attemptStatus;
    input.onProgress?.({ status: attemptStatus, message: label });

    if (attemptStatus === 'matched' && typeof record.token === 'string' && record.token) {
      return {
        token: record.token,
        friendCode: friendCodeFromUser(record.user)
          ?? (typeof record.resolvedFriendCode === 'string' ? record.resolvedFriendCode : null),
      };
    }
    if (attemptStatus === 'failed') {
      throw new ScoreHubError(
        typeof record.error === 'string' && record.error
          ? record.error
          : '神秘二维码登录失败，请改用好友码上传',
      );
    }

    await sleep(QR_POLL_MS, input.signal);
  }
  throw new ScoreHubError('神秘二维码登录超时，请刷新二维码后重试或改用好友码');
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

export async function pollLoginUntilToken(input: {
  jobId: string;
  signal?: ScoreHubAbortSignal;
  onSendingFriend?: (info: { botFriendCode: string | null; stage: string | null }) => void;
  onWaitingFriend?: (info: { botFriendCode: string | null; stage: string | null }) => void;
}): Promise<string> {
  const deadline = Date.now() + LOGIN_TIMEOUT_MS;
  let lastVerifyAt = 0;

  while (Date.now() < deadline) {
    if (input.signal?.aborted) throw new ScoreHubError('已取消');
    let status: number;
    let body: unknown;
    try {
      ({ status, body } = await requestJson(
        'GET',
        `/auth/login-requests/${encodeURIComponent(input.jobId)}`,
        { signal: input.signal },
      ));
    } catch (error) {
      if (!isRetryableScoreHubError(error)) throw error;
      await sleep(LOGIN_POLL_MS, input.signal);
      continue;
    }
    if (status !== 200 || !body || typeof body !== 'object') {
      await sleep(LOGIN_POLL_MS, input.signal);
      continue;
    }
    const record = body as Record<string, unknown>;
    if (typeof record.token === 'string' && record.token) {
      return record.token;
    }
    const job = record.job && typeof record.job === 'object' ? (record.job as Record<string, unknown>) : {};
    const jobStatus = String(record.status ?? job.status ?? '');
    const stage = typeof job.stage === 'string' ? job.stage : null;
    const bot =
      (typeof job.botUserFriendCode === 'string' && job.botUserFriendCode) || null;

    if (jobStatus === 'failed' || record.status === 'failed') {
      throw new ScoreHubError(String(job.error ?? '登录失败'));
    }

    if (stage === 'wait_acceptance' || stage === 'wait_user_request') {
      input.onWaitingFriend?.({ botFriendCode: bot, stage });
    } else {
      // send_request 等发送阶段：尚未发出申请，不要提示「等待同意」
      input.onSendingFriend?.({ botFriendCode: bot, stage });
    }

    const now = Date.now();
    if (now - lastVerifyAt >= VERIFY_EVERY_MS) {
      lastVerifyAt = now;
      try {
        await verifyLoginJob(input.jobId, input.signal);
      } catch {
        // verify 失败不中断轮询
      }
    }

    await sleep(LOGIN_POLL_MS, input.signal);
  }
  throw new ScoreHubError('登录超时：请确认已在“舞萌-中二公众号-我的记录-舞萌DX”接受 Bot 好友申请');
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

export async function pollUpdateScoreUntilDone(input: {
  token: string;
  jobId: string;
  signal?: ScoreHubAbortSignal;
  onProgress?: (info: {
    status: string;
    stage: string | null;
    progress: ScoreHubScoreProgress | null;
  }) => void;
}): Promise<void> {
  const deadline = Date.now() + SCORE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (input.signal?.aborted) throw new ScoreHubError('已取消');
    let status: number;
    let body: unknown;
    try {
      ({ status, body } = await requestJson(
        'GET',
        `/me/dxnet-jobs/${encodeURIComponent(input.jobId)}`,
        { token: input.token, signal: input.signal },
      ));
    } catch (error) {
      if (!isRetryableScoreHubError(error)) throw error;
      // 服务端任务可能仍在抓取；单次 poll 断连（如 terminated）不应整段放弃。
      const message = error instanceof Error
        ? error.message
        : '网络连接中断，正在重试…';
      input.onProgress?.({
        status: 'processing',
        stage: message.includes('重试') ? message : '网络连接中断，正在重试…',
        progress: null,
      });
      await sleep(SCORE_POLL_MS, input.signal);
      continue;
    }
    if (status !== 200 || !body || typeof body !== 'object') {
      await sleep(SCORE_POLL_MS, input.signal);
      continue;
    }
    const job = body as Record<string, unknown>;
    const st = String(job.status ?? '');
    const stage = typeof job.stage === 'string' ? job.stage : null;
    const rawProgress = job.scoreProgress;
    const progress = rawProgress && typeof rawProgress === 'object'
      && Array.isArray((rawProgress as Record<string, unknown>).completedDiffs)
      && typeof (rawProgress as Record<string, unknown>).totalDiffs === 'number'
      ? {
          completedDiffs: (rawProgress as { completedDiffs: unknown[] }).completedDiffs
            .filter((value): value is number => typeof value === 'number' && Number.isInteger(value)),
          totalDiffs: (rawProgress as { totalDiffs: number }).totalDiffs,
        }
      : null;
    input.onProgress?.({ status: st, stage, progress });
    if (st === 'completed') return;
    if (st === 'failed' || st === 'canceled') {
      throw new ScoreHubError(String(job.error ?? '获取成绩失败'));
    }
    await sleep(SCORE_POLL_MS, input.signal);
  }
  throw new ScoreHubError('获取成绩超时');
}

const CABINET_JOB_STATUSES = new Set<ScoreHubCabinetScoreJobStatus>([
  'queued',
  'processing',
  'completed',
  'failed',
]);
const CABINET_JOB_STAGES = new Set<ScoreHubCabinetScoreJobStage>([
  'queued',
  'qr_auth',
  'preview',
  'login',
  'get_music',
  'logout',
  'cleanup',
  'persist',
]);
const CABINET_JOB_CLEANUP_STATUSES = new Set<ScoreHubCabinetScoreJobCleanupStatus>([
  'not_required',
  'pending',
  'succeeded',
  'unconfirmed',
]);

function cabinetScoreErrorDetails(body: unknown): { code?: string; retryAfter?: string } {
  if (!body || typeof body !== 'object') return {};
  const record = body as Record<string, unknown>;
  const nested = record.error && typeof record.error === 'object'
    ? record.error as Record<string, unknown>
    : null;
  const code = typeof record.code === 'string'
    ? record.code
    : typeof nested?.code === 'string'
      ? nested.code
      : undefined;
  const retryAfter = typeof record.retryAfter === 'string'
    ? record.retryAfter
    : typeof nested?.retryAfter === 'string'
      ? nested.retryAfter
      : undefined;
  return { code, retryAfter };
}

function cabinetScoreRequestError(body: unknown, status: number): ScoreHubError {
  const details = cabinetScoreErrorDetails(body);
  return new ScoreHubError(
    details.code ?? 'cabinet score request failed',
    status,
    status >= 500 || status === 429,
    details,
  );
}

function parseCabinetScoreJob(raw: unknown): ScoreHubCabinetScoreJob | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const status = record.status;
  const stage = record.stage;
  const cleanupStatus = record.cleanupStatus;
  if (typeof record.id !== 'string'
    || !CABINET_JOB_STATUSES.has(status as ScoreHubCabinetScoreJobStatus)
    || !CABINET_JOB_STAGES.has(stage as ScoreHubCabinetScoreJobStage)
    || !CABINET_JOB_CLEANUP_STATUSES.has(cleanupStatus as ScoreHubCabinetScoreJobCleanupStatus)
    || typeof record.createdAt !== 'string'
    || typeof record.updatedAt !== 'string') {
    return null;
  }
  const rawProgress = record.progress;
  const progress = rawProgress && typeof rawProgress === 'object'
    && typeof (rawProgress as Record<string, unknown>).detailsFetched === 'number'
    ? { detailsFetched: (rawProgress as { detailsFetched: number }).detailsFetched }
    : null;
  const details = cabinetScoreErrorDetails(record);
  return {
    id: record.id,
    status: status as ScoreHubCabinetScoreJobStatus,
    stage: stage as ScoreHubCabinetScoreJobStage,
    cleanupStatus: cleanupStatus as ScoreHubCabinetScoreJobCleanupStatus,
    progress,
    syncId: typeof record.syncId === 'string' ? record.syncId : null,
    scoreCount: typeof record.scoreCount === 'number' ? record.scoreCount : null,
    error: details.code
      ? { code: details.code, retryAfter: details.retryAfter ?? null }
      : null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export async function createCabinetScoreJob(
  token: string,
  credential: QrLoginCredential,
  signal?: ScoreHubAbortSignal,
): Promise<ScoreHubCabinetScoreJob> {
  let response: { status: number; body: unknown };
  if (credential.kind === 'text') {
    const qrCode = credential.qrCode.trim();
    if (!qrCode) {
      throw new ScoreHubError(
        'qr code required',
        400,
        false,
        { code: 'QR_INPUT_REQUIRED' },
      );
    }
    response = await requestJson('POST', '/me/cabinet-score-jobs', {
      body: { qrCode },
      token,
      signal,
      timeoutMs: QR_LOGIN_POST_TIMEOUT_MS,
    });
  } else {
    const formData = new FormData();
    formData.append('image', {
      uri: credential.imageUri,
      name: credential.fileName?.trim() || 'qr.jpg',
      type: credential.mimeType?.trim() || 'image/jpeg',
    } as unknown as Blob);
    response = await requestRaw('POST', '/me/cabinet-score-jobs', {
      formData,
      token,
      signal,
      timeoutMs: QR_LOGIN_POST_TIMEOUT_MS,
    });
  }
  if (response.status !== 202 || !response.body || typeof response.body !== 'object') {
    throw cabinetScoreRequestError(response.body, response.status);
  }
  const job = parseCabinetScoreJob((response.body as Record<string, unknown>).job);
  if (!job) {
    throw new ScoreHubError(
      'invalid cabinet score job response',
      response.status,
      false,
      { code: 'CABINET_SCORE_JOB_FAILED' },
    );
  }
  return job;
}

export async function fetchActiveCabinetScoreJob(
  token: string,
  signal?: ScoreHubAbortSignal,
): Promise<ScoreHubCabinetScoreJob | null> {
  const { status, body } = await requestJson('GET', '/me/cabinet-score-jobs/active', {
    token,
    signal,
  });
  if (status !== 200 || !body || typeof body !== 'object') {
    throw cabinetScoreRequestError(body, status);
  }
  const rawJob = (body as Record<string, unknown>).job;
  if (rawJob === null) return null;
  const job = parseCabinetScoreJob(rawJob);
  if (!job) {
    throw new ScoreHubError(
      'invalid active cabinet score job response',
      status,
      false,
      { code: 'CABINET_SCORE_JOB_FAILED' },
    );
  }
  return job;
}

export async function fetchCabinetScoreJob(
  token: string,
  jobId: string,
  signal?: ScoreHubAbortSignal,
): Promise<ScoreHubCabinetScoreJob> {
  const { status, body } = await requestJson(
    'GET',
    `/me/cabinet-score-jobs/${encodeURIComponent(jobId)}`,
    { token, signal },
  );
  if (status !== 200) {
    throw cabinetScoreRequestError(body, status);
  }
  const job = parseCabinetScoreJob(body);
  if (!job) {
    throw new ScoreHubError(
      'invalid cabinet score job response',
      status,
      false,
      { code: 'CABINET_SCORE_JOB_FAILED' },
    );
  }
  return job;
}

function cabinetCleanupBlocked(job: ScoreHubCabinetScoreJob): boolean {
  if (job.cleanupStatus === 'pending') return true;
  if (job.cleanupStatus !== 'unconfirmed' || !job.error?.retryAfter) return false;
  const retryAt = Date.parse(job.error.retryAfter);
  return Number.isFinite(retryAt) && retryAt > Date.now();
}

export async function pollCabinetScoreJobUntilDone(input: {
  token: string;
  job: ScoreHubCabinetScoreJob;
  signal?: ScoreHubAbortSignal;
  onProgress?: (job: ScoreHubCabinetScoreJob) => void;
}): Promise<ScoreHubCabinetScoreJob> {
  const createdAt = Date.parse(input.job.createdAt);
  const deadline = Number.isFinite(createdAt)
    ? createdAt + CABINET_SCORE_TIMEOUT_MS
    : Date.now() + CABINET_SCORE_TIMEOUT_MS;
  let current = input.job;
  let consecutiveFailures = 0;

  while (Date.now() < deadline) {
    if (input.signal?.aborted) throw new ScoreHubError('已取消');
    input.onProgress?.(current);
    if (current.status === 'completed') return current;
    if (current.status === 'failed' && !cabinetCleanupBlocked(current)) {
      throw new ScoreHubError(
        current.error?.code ?? 'cabinet score job failed',
        undefined,
        false,
        {
          code: current.error?.code ?? 'CABINET_SCORE_JOB_FAILED',
          retryAfter: current.error?.retryAfter ?? undefined,
        },
      );
    }
    await sleep(CABINET_SCORE_POLL_MS, input.signal);
    try {
      current = await fetchCabinetScoreJob(input.token, current.id, input.signal);
      consecutiveFailures = 0;
    } catch (error) {
      if (!isRetryableScoreHubError(error)) throw error;
      consecutiveFailures += 1;
      if (consecutiveFailures >= CABINET_SCORE_FAILURE_LIMIT) throw error;
    }
  }
  throw new ScoreHubError(
    'cabinet score job timeout',
    undefined,
    true,
    { code: 'CABINET_SCORE_JOB_FAILED' },
  );
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
