import { fetch as expoFetch } from 'expo/fetch';
import { z } from 'zod';
import { requestProviderResponse } from '@/providers/http-json';
import { ProviderError } from '@/providers/errors';

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
  addEventListener?: AbortSignal['addEventListener'];
  removeEventListener?: AbortSignal['removeEventListener'];
};

/** React Native 的 AbortSignal 可能没有 throwIfAborted 或 reason。 */
export function assertUploadActive(signal: AbortSignal): void {
  if (signal.aborted) throw signal.reason ?? new ScoreHubError('已取消');
}

export async function withUploadAbortSignal<T>(signal: ScoreHubAbortSignal | undefined, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  await signal?.waitUntilResumed?.();
  const controller = new AbortController();
  const cancel = () => controller.abort(new ScoreHubError('已取消'));
  if (signal?.aborted) cancel();
  const unsubscribe = signal?.onCancel?.(cancel);
  signal?.addEventListener?.('abort', cancel, { once: true });
  try {
    if (signal?.aborted) cancel();
    assertUploadActive(controller.signal);
    return await run(controller.signal);
  } catch (error) {
    assertUploadActive(controller.signal);
    throw error;
  } finally {
    unsubscribe?.();
    signal?.removeEventListener?.('abort', cancel);
  }
}

export async function waitForUploadDelay(ms: number, signal?: ScoreHubAbortSignal): Promise<void> {
  await withUploadAbortSignal(signal, nativeSignal => new Promise<void>((resolve, reject) => {
    const cancel = () => { clearTimeout(timer); reject(nativeSignal.reason ?? new ScoreHubError('已取消')); };
    const timer = setTimeout(() => { nativeSignal.removeEventListener('abort', cancel); resolve(); }, ms);
    nativeSignal.addEventListener('abort', cancel, { once: true });
  }));
  await signal?.waitUntilResumed?.();
  if (signal?.aborted) throw new ScoreHubError('已取消');
}

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
  try {
    return await withUploadAbortSignal(options?.signal, signal => requestProviderResponse({
      baseUrl: SCORE_HUB_API_BASE, path, fetcher: expoFetch as unknown as typeof fetch, label: 'score-hub',
      schema: z.object({ status: z.number(), body: z.unknown() }),
      authenticated: true, signal, totalAttempts: 1,
      timeoutMs: options?.timeoutMs ?? SCORE_HUB_REQUEST_TIMEOUT_MS,
      acceptStatus: () => true,
      error: status => new ProviderError('network', `score-hub 请求失败（${status}）`, status >= 500),
      init: {
      method,
      headers,
      body: options?.formData !== undefined
        ? options.formData
        : options?.jsonBody === undefined
          ? undefined
          : JSON.stringify(options.jsonBody),
      },
    }, async response => {
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
    }));
  } catch (error) {
    if (options?.signal?.aborted) throw new ScoreHubError('已取消');
    if (error instanceof ProviderError && error.code === 'timeout') {
      throw new ScoreHubError(
        'score-hub 请求超时，正在重试…',
        undefined,
        true,
      );
    }
    const raw = error instanceof Error ? error.message : '无法连接 score-hub';
    throw new ScoreHubError(normalizeNetworkErrorMessage(raw), undefined, error instanceof ProviderError ? error.retryable : true);
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
