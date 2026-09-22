import {
  isRetryableScoreHubError,
  requestScoreHubJson as requestJson,
  ScoreHubError,
  type ScoreHubAbortSignal,
} from '@/services/score-hub-http';
import {
  friendCodeFromUser,
  QR_LOGIN_STATUS_LABEL,
  type QrLoginTokenResult,
  type ScoreHubCabinetScoreJob,
  type ScoreHubScoreProgress,
} from '@/services/score-hub-types';
import { fetchCabinetScoreJob } from '@/services/score-hub-cabinet';

const LOGIN_POLL_MS = 3_000;
const SCORE_POLL_MS = 5_000;
const LOGIN_TIMEOUT_MS = 8 * 60_000;
const SCORE_TIMEOUT_MS = 20 * 60_000;
const VERIFY_EVERY_MS = 20_000;
const QR_POLL_MS = 1_000;
const QR_LOGIN_TIMEOUT_MS = 5 * 60_000;
const CABINET_SCORE_POLL_MS = 1_000;
const CABINET_SCORE_TIMEOUT_MS = 30 * 60_000;
const CABINET_SCORE_FAILURE_LIMIT = 5;

export async function verifyLoginJob(jobId: string, signal?: ScoreHubAbortSignal): Promise<void> {
  await requestJson('POST', `/auth/login-requests/${encodeURIComponent(jobId)}/verify`, { signal });
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
