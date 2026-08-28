import { fetch as expoFetch } from 'expo/fetch';
import { z } from 'zod';
import { ProviderError, providerErrorFromStatus } from './errors';

type FetchLike = typeof fetch;
const pause = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal?.aborted) { reject(signal.reason); return; }
  const timeout = setTimeout(() => {
    signal?.removeEventListener('abort', onAbort);
    resolve();
  }, ms);
  const onAbort = () => {
    clearTimeout(timeout);
    reject(signal?.reason);
  };
  signal?.addEventListener('abort', onAbort, { once: true });
});

/** Retry-After 头解析：秒或 HTTP 日期，上限 5s。 */
export function retryAfterMs(response: Response): number {
  const raw = response.headers.get('Retry-After');
  if (!raw) return 1_000;
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return Math.min(5_000, Math.max(0, seconds * 1_000));
  const date = Date.parse(raw);
  return Number.isFinite(date) ? Math.min(5_000, Math.max(0, date - Date.now())) : 1_000;
}

export type JsonRequestOptions<T> = {
  path: string;
  schema: z.ZodType<T>;
  fetcher: FetchLike;
  baseUrl: string;
  /** 状态码 → 错误（文案由调用方按游戏提供）。 */
  error: (status: number) => ProviderError;
  /** 游戏名（用于超时/网络/结构错误的文案，如「MuseDash.moe」）。 */
  label: string;
  timeoutMs?: number;
  retries?: number;
  /** 覆盖结构、超时和网络错误文案。 */
  messages?: { schema?: string; timeout?: string; network?: string };
  signal?: AbortSignal;
};

/** 通用 JSON GET 请求：重试、429 退避、超时与错误归一化（各公开查分 Provider 共用）。 */
export async function requestJson<T>(options: JsonRequestOptions<T>): Promise<T> {
  const { path, schema, fetcher, baseUrl, error, label } = options;
  const timeoutMs = options.timeoutMs ?? 12_000;
  const retries = options.retries ?? 2;
  const schemaMessage = options.messages?.schema ?? `${label}数据结构与已验证契约不一致`;
  const timeoutMessage = options.messages?.timeout ?? `${label}数据读取超时`;
  const networkMessage = options.messages?.network ?? `无法连接${label}服务`;
  let previousError: ProviderError | null = null;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    if (options.signal?.aborted) throw options.signal.reason;
    const controller = new AbortController();
    const onExternalAbort = () => controller.abort();
    options.signal?.addEventListener('abort', onExternalAbort, { once: true });
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetcher(`${baseUrl}${path}`, {
        headers: { Accept: 'application/json', 'Cache-Control': 'no-store' }, signal: controller.signal,
      });
      if (!response.ok) {
        const mapped = error(response.status);
        if (attempt === 0 && mapped.retryable) {
          previousError = mapped;
          if (response.status === 429) await pause(retryAfterMs(response), options.signal);
          continue;
        }
        throw mapped;
      }
      return schema.parse(await response.json());
    } catch (caught) {
      if (options.signal?.aborted) throw caught;
      if (caught instanceof z.ZodError || caught instanceof SyntaxError) {
        throw new ProviderError('upstream_schema', schemaMessage, true, { cause: caught });
      }
      if (caught instanceof ProviderError) throw caught;
      const normalized = caught instanceof Error && caught.name === 'AbortError'
        ? new ProviderError('timeout', timeoutMessage, true, { cause: caught })
        : new ProviderError('network', networkMessage, true, { cause: caught });
      if (attempt === 0) { previousError = normalized; continue; }
      throw normalized;
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', onExternalAbort);
    }
  }
  throw previousError ?? new ProviderError('network', networkMessage, true);
}

export type ProviderJsonOptions = {
  baseUrl: string;
  path: string;
  /** 三段错误文案（无效 JSON/读取超时/无法连接），由调用方按数据源逐字提供。 */
  invalidJsonMessage: string;
  timeoutMessage: string;
  networkMessage: string;
  signal?: AbortSignal;
};

/**
 * 公共曲库类 JSON GET：expoFetch + 12s 超时 + 状态码（providerErrorFromStatus）
 * 与解析/超时/网络错误归一化，无重试（LXNS 公共曲库语义）。
 */
export async function fetchProviderJson(options: ProviderJsonOptions): Promise<unknown> {
  const controller = new AbortController();
  const onExternalAbort = () => controller.abort();
  if (options.signal?.aborted) controller.abort(options.signal.reason);
  else options.signal?.addEventListener('abort', onExternalAbort, { once: true });
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await expoFetch(`${options.baseUrl}${options.path}`, {
      headers: { Accept: 'application/json' }, signal: controller.signal,
    });
    if (!response.ok) throw providerErrorFromStatus(response.status);
    return await response.json();
  } catch (error) {
    if (options.signal?.aborted) throw error;
    if (error instanceof ProviderError) throw error;
    if (error instanceof SyntaxError) {
      throw new ProviderError('upstream_schema', options.invalidJsonMessage, true, { cause: error });
    }
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ProviderError('timeout', options.timeoutMessage, true, { cause: error });
    }
    throw new ProviderError('network', options.networkMessage, true, { cause: error });
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', onExternalAbort);
  }
}
