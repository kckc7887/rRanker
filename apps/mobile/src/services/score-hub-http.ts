import { fetch as expoFetch } from 'expo/fetch';

export const SCORE_HUB_API_BASE = 'https://api.maiscorehub.bakapiano.com/api/v1';
export const SCORE_HUB_REQUEST_TIMEOUT_MS = 60_000;

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

export async function requestScoreHubRaw(
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
  const timeoutMs = options?.timeoutMs ?? SCORE_HUB_REQUEST_TIMEOUT_MS;
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

export async function requestScoreHubJson(
  method: string,
  path: string,
  options?: {
    body?: unknown;
    token?: string;
    signal?: ScoreHubAbortSignal;
    timeoutMs?: number;
  },
): Promise<{ status: number; body: unknown }> {
  return requestScoreHubRaw(method, path, {
    jsonBody: options?.body,
    token: options?.token,
    signal: options?.signal,
    timeoutMs: options?.timeoutMs,
  });
}
