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

export const QR_LOGIN_STATUS_LABEL: Record<string, string> = {
  pending: '正在准备登录…',
  adding_rival: '正在添加好友…',
  waiting_snapshot: '确认好友身份中（通常需要 1 分钟）…',
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

export class ScoreHubError extends Error {
  readonly status?: number;
  readonly retryable: boolean;

  constructor(message: string, status?: number, retryable = false) {
    super(message);
    this.name = 'ScoreHubError';
    this.status = status;
    this.retryable = retryable;
  }
}

export type ScoreHubAbortSignal = { aborted: boolean };

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
    throw new ScoreHubError('神秘二维码已过期，请在公众号重新打开玩家二维码后重试', status);
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
  input.onProgress?.({ status: 'pending', message: '正在提交神秘二维码…' });
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
  onWaitingFriend?: (info: { botFriendCode: string | null; stage: string | null }) => void;
}): Promise<string> {
  const deadline = Date.now() + LOGIN_TIMEOUT_MS;
  let lastVerifyAt = 0;
  let notifiedFriend = false;

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
      if (!notifiedFriend) {
        notifiedFriend = true;
        input.onWaitingFriend?.({ botFriendCode: bot, stage });
      } else {
        input.onWaitingFriend?.({ botFriendCode: bot, stage });
      }
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
  const body: Record<string, string> = { jobType: 'update_score' };
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
