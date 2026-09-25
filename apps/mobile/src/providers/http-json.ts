import { fetch as expoFetch } from 'expo/fetch';
import { z } from 'zod';
import { ProviderError, providerErrorFromStatus } from './errors';
import { nextRuntimeOperationId, recordRuntimeDiagnostic } from '@/services/runtime-diagnostics-recorder';
import type { RuntimeRequestScenario } from '@/domain/runtime-log';

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

/** Retry-After 头解析：秒或 HTTP 日期，默认上限 5s；交互式冷却可指定其它上限。 */
export function retryAfterMs(response: Response, maxMs = 5_000): number {
  const raw = response.headers.get('Retry-After');
  if (!raw) return 1_000;
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return Math.min(maxMs, Math.max(0, seconds * 1_000));
  const date = Date.parse(raw);
  return Number.isFinite(date) ? Math.min(maxMs, Math.max(0, date - Date.now())) : 1_000;
}

export type JsonRequestOptions<T> = {
  init?: RequestInit;
  onResponse?: (response: Response) => void | Promise<void>;
  diagnosticScenario?: RuntimeRequestScenario;
  path: string;
  schema: z.ZodType<T>;
  fetcher: FetchLike;
  baseUrl: string;
  /** 状态码 → 错误（文案由调用方按游戏提供）。 */
  error: (status: number) => ProviderError;
  /** 游戏名（用于超时/网络/结构错误的文案，如「MuseDash.moe」）。 */
  label: string;
  timeoutMs?: number;
  /** 总尝试次数：含首次请求，1 表示不自动重试。只读、登录与写请求用 1 明确表达。 */
  totalAttempts?: number;
  /** 额外重试次数：总尝试次数 = 额外重试次数 + 1。与 totalAttempts 同时给出时以 totalAttempts 为准。 */
  extraRetries?: number;
  /** 旧字段：语义等同 totalAttempts（总尝试次数），新调用方请改用 totalAttempts / extraRetries。 */
  retries?: number;
  /** 覆盖结构、超时和网络错误文案。 */
  messages?: { schema?: string; timeout?: string; network?: string };
  signal?: AbortSignal;
};

/** 总尝试次数解析：totalAttempts 优先，其次旧字段 retries，再其次 extraRetries + 1。 */
export function resolveTotalAttempts(options: Pick<JsonRequestOptions<unknown>, 'totalAttempts' | 'extraRetries' | 'retries'>): number {
  if (options.totalAttempts !== undefined) return options.totalAttempts;
  if (options.retries !== undefined) return options.retries;
  if (options.extraRetries !== undefined) return options.extraRetries + 1;
  return 2;
}

/** 通用 JSON GET 请求：重试、429 退避、超时与错误归一化（各公开查分 Provider 共用）。 */
async function requestData<T>(options: JsonRequestOptions<T>, read: (response: Response) => Promise<unknown>, source: string): Promise<T> {
  const { path, schema, fetcher, baseUrl, error, label } = options;
  const timeoutMs = options.timeoutMs ?? 12_000;
  const totalAttempts = resolveTotalAttempts(options);
  const schemaMessage = options.messages?.schema ?? `${label}数据结构与已验证契约不一致`;
  const timeoutMessage = options.messages?.timeout ?? `${label}数据读取超时`;
  const networkMessage = options.messages?.network ?? `无法连接${label}服务`;
  let previousError: ProviderError | null = null;
  const operationId = nextRuntimeOperationId();
  const diagnostic = { source, scenario: options.diagnosticScenario, operationId };
  void recordRuntimeDiagnostic('request-start', diagnostic);
  for (let attempt = 0; attempt < totalAttempts; attempt += 1) {
    if (options.signal?.aborted) {
      void recordRuntimeDiagnostic('request', { ...diagnostic, result: 'cancelled', errorCode: 'cancelled', attempt: attempt + 1, durationMs: 0 });
      throw options.signal.reason;
    }
    const controller = new AbortController();
    const onExternalAbort = () => controller.abort(options.signal?.reason);
    options.signal?.addEventListener('abort', onExternalAbort, { once: true });
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const started = Date.now();
    let status: number | undefined;
    let result = 'error';
    let diagnosticError: unknown;
    try {
      const headers: Record<string, string> = { Accept: 'application/json', 'Cache-Control': 'no-store' };
      new Headers(options.init?.headers).forEach((value, key) => {
        headers[Object.keys(headers).find(existing => existing.toLowerCase() === key) ?? key] = value;
      });
      const response = await fetcher(`${baseUrl}${path}`, {
        ...options.init,
        headers, signal: controller.signal,
      });
      if (options.signal?.aborted) throw options.signal.reason;
      await options.onResponse?.(response);
      status = response.status;
      if (!response.ok) {
        const mapped = error(response.status);
        diagnosticError = mapped;
        const willRetry = attempt + 1 < totalAttempts;
        if (mapped.retryable && willRetry) {
          previousError = mapped;
          if (response.status === 429) await pause(retryAfterMs(response), options.signal);
          continue;
        }
        throw mapped;
      }
      const data = schema.parse(await read(response));
      if (options.signal?.aborted) throw options.signal.reason;
      result = 'success';
      return data;
    } catch (caught) {
      diagnosticError = caught;
      if (options.signal?.aborted) result = 'cancelled';
      if (options.signal?.aborted) throw caught;
      if (caught instanceof z.ZodError || caught instanceof SyntaxError) {
        diagnosticError = new ProviderError('upstream_schema', schemaMessage, true, { cause: caught });
        throw diagnosticError;
      }
      if (caught instanceof ProviderError) throw caught;
      const normalized = caught instanceof Error && caught.name === 'AbortError'
        ? new ProviderError('timeout', timeoutMessage, true, { cause: caught })
        : new ProviderError('network', networkMessage, true, { cause: caught });
      diagnosticError = normalized;
      if (attempt + 1 < totalAttempts) { previousError = normalized; continue; }
      throw normalized;
    } finally {
      void recordRuntimeDiagnostic('request', {
        ...diagnostic, result, status, attempt: attempt + 1, durationMs: Date.now() - started,
        errorCode: result === 'cancelled' ? 'cancelled' : diagnosticError instanceof ProviderError ? diagnosticError.code : undefined,
        error: result === 'cancelled' ? undefined : diagnosticError,
      });
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', onExternalAbort);
    }
  }
  throw previousError ?? new ProviderError('network', networkMessage, true);
}

export function requestJson<T>(options: JsonRequestOptions<T>): Promise<T> {
  return requestData(options, (response) => response.json(), 'request-json');
}

export function requestProviderResponse<T>(options: JsonRequestOptions<T>, read: (response: Response) => Promise<unknown>): Promise<T> {
  return requestData(options, read, 'request-json');
}

export function requestBytes(options: Omit<JsonRequestOptions<Uint8Array>, 'schema'>): Promise<Uint8Array> {
  return requestData({ ...options, schema: z.instanceof(Uint8Array) },
    async (response) => new Uint8Array(await response.arrayBuffer()), 'request-bytes');
}

export type ProviderJsonOptions = {
  diagnosticScenario?: RuntimeRequestScenario;
  baseUrl: string;
  path: string;
  /** 三段错误文案（无效 JSON/读取超时/无法连接），由调用方按数据源逐字提供。 */
  invalidJsonMessage: string;
  timeoutMessage: string;
  networkMessage: string;
  signal?: AbortSignal;
};

/**
 * 公共曲库类 JSON GET：走同一执行器（超时、取消、状态码映射与解析/超时/网络错误归一化），
 * 只读曲库语义下总尝试次数固定为 1；错误文案由调用方逐字提供。
 */
export function fetchProviderJson(options: ProviderJsonOptions): Promise<unknown> {
  return requestData({
    baseUrl: options.baseUrl,
    path: options.path,
    schema: z.unknown(),
    fetcher: expoFetch as unknown as FetchLike,
    signal: options.signal,
    diagnosticScenario: options.diagnosticScenario,
    label: '公共曲库',
    totalAttempts: 1,
    error: (status) => providerErrorFromStatus(status),
    messages: {
      schema: options.invalidJsonMessage,
      timeout: options.timeoutMessage,
      network: options.networkMessage,
    },
  }, (response) => response.json(), 'provider-json');
}
