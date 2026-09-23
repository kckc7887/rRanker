import {
  requestScoreHubJson as requestJson,
  requestScoreHubRaw as requestRaw,
  ScoreHubError,
  type ScoreHubAbortSignal,
} from '@/services/score-hub-http';
import type {
  QrLoginCredential,
  ScoreHubCabinetScoreJob,
  ScoreHubCabinetScoreJobCleanupStatus,
  ScoreHubCabinetScoreJobStage,
  ScoreHubCabinetScoreJobStatus,
} from '@/services/score-hub-types';

const QR_LOGIN_POST_TIMEOUT_MS = 150_000;

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

export function cabinetScoreRequestError(body: unknown, status: number): ScoreHubError {
  const details = cabinetScoreErrorDetails(body);
  return new ScoreHubError(
    details.code ?? 'cabinet score request failed',
    status,
    status >= 500 || status === 429,
    details,
  );
}

export function parseCabinetScoreJob(raw: unknown): ScoreHubCabinetScoreJob | null {
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
