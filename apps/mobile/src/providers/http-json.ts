import { fetch as expoFetch } from 'expo/fetch';
import { z } from 'zod';
import { ProviderError, providerErrorFromStatus } from './errors';
import { nextRuntimeOperationId, recordRuntimeDiagnostic } from '@/services/runtime-diagnostics-recorder';
import type { RuntimeRequestScenario } from '@/domain/runtime-log';
import { SessionPersistenceError } from '@/domain/session-vault';

type FetchLike = typeof fetch;
export const PROVIDER_MAX_RESPONSE_BYTES = 64 * 1024 * 1024;

/** 按流累计字节，限制实际读取量。 */
export async function readProviderResponseBytes(response: Response, options: {
  maxBytes?: number; signal?: AbortSignal; message?: string;
} = {}): Promise<Uint8Array> {
  const maximum = options.maxBytes ?? PROVIDER_MAX_RESPONSE_BYTES;
  if (!Number.isSafeInteger(maximum) || maximum < 1) throw new TypeError('响应预算必须是有限正整数');
  const exceeded = () => new ProviderError('upstream_schema', options.message ?? '响应大小超出读取预算', false);
  const declared = response.headers?.get('content-length');
  const stream = response.body;
  if (declared && /^\d+$/.test(declared) && Number(declared) > maximum) {
    void stream?.cancel().catch(() => undefined);
    throw exceeded();
  }
  if (options.signal?.aborted) throw options.signal.reason;
  if (!stream) {
    const bytes = typeof response.arrayBuffer === 'function'
      ? new Uint8Array(await abortable(response.arrayBuffer(), options.signal))
      : new TextEncoder().encode(typeof response.text === 'function'
        ? await abortable(response.text(), options.signal)
        : JSON.stringify(await abortable(response.json(), options.signal)));
    if (bytes.byteLength > maximum) throw exceeded();
    return bytes;
  }
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  const onAbort = () => { void reader.cancel(options.signal?.reason).catch(() => undefined); };
  options.signal?.addEventListener('abort', onAbort, { once: true });
  try {
    for (;;) {
      const item = await abortable(reader.read(), options.signal);
      if (options.signal?.aborted) throw options.signal.reason;
      if (item.done) break;
      length += item.value.byteLength;
      if (length > maximum) throw exceeded();
      chunks.push(item.value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return bytes;
  } catch (error) {
    void reader.cancel(error).catch(() => undefined);
    throw error;
  } finally {
    options.signal?.removeEventListener('abort', onAbort);
    reader.releaseLock();
  }
}

function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) {
    void promise.catch(() => undefined);
    return Promise.reject(signal.reason);
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => { signal.removeEventListener('abort', onAbort); reject(signal.reason); };
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

function boundedResponse(response: Response, options: { maxBytes?: number; signal?: AbortSignal }): Response {
  let bytes: Promise<Uint8Array> | undefined;
  const load = () => bytes ??= readProviderResponseBytes(response, options);
  return new Proxy(response, { get(target, key) {
    if (key === 'arrayBuffer') return async () => (await load()).buffer;
    if (key === 'text') return async () => new TextDecoder('utf-8', { fatal: true }).decode(await load());
    if (key === 'json') return async () => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await load()));
    const value = Reflect.get(target, key, target);
    return typeof value === 'function' ? value.bind(target) : value;
  } });
}
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

/** Retry-After 支持秒数或 HTTP 日期，默认最多等待 5 秒。 */
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
  /** 凭据请求禁用自动 Cookie 和重定向。 */
  authenticated?: boolean;
  maxResponseBytes?: number;
  onHttpError?: (response: Response) => Promise<ProviderError>;
  acceptStatus?: (status: number) => boolean;
  onResponse?: (response: Response) => void | Promise<void>;
  diagnosticScenario?: RuntimeRequestScenario;
  diagnosticParentOperationId?: number;
  path: string;
  schema: z.ZodType<T>;
  fetcher: FetchLike;
  baseUrl: string;
  error: (status: number) => ProviderError;
  label: string;
  timeoutMs?: number;
  /** 包含首次请求。 */
  totalAttempts?: number;
  messages?: { schema?: string; timeout?: string; network?: string };
  signal?: AbortSignal;
};

function providerRequestInit(init: RequestInit | undefined, authenticated: boolean | undefined, signal: AbortSignal) {
  const headers: Record<string, string> = { Accept: 'application/json', 'Cache-Control': 'no-store' };
  new Headers(init?.headers).forEach((value, key) => {
    headers[Object.keys(headers).find(existing => existing.toLowerCase() === key) ?? key] = value;
  });
  const sensitive = authenticated || Object.keys(headers).some(key => /authorization|cookie|token|secret|phone/i.test(key));
  return { sensitive, init: { ...init, credentials: 'omit' as const,
    ...(sensitive ? { redirect: 'error' as const } : {}), headers, signal } };
}

function assertProviderResponseOrigin(response: Response, url: string, sensitive?: boolean): void {
  if (!sensitive || !response.url || new URL(response.url).origin === new URL(url).origin) return;
  void response.body?.cancel().catch(() => undefined);
  throw new ProviderError('permission', '凭据响应地址不属于当前服务', false);
}
function assertRequestActive(signal?: AbortSignal): void {
  if (signal?.aborted) throw signal.reason;
}

function normalizeExecutionError(error: unknown, timedOut: boolean, texts: { schema: string; timeout: string; network: string }): ProviderError {
  if (error instanceof z.ZodError || error instanceof SyntaxError) {
    return new ProviderError('upstream_schema', texts.schema, true, { cause: error });
  }
  return timedOut || (error instanceof Error && error.name === 'AbortError')
    ? new ProviderError('timeout', texts.timeout, true, { cause: error })
    : new ProviderError('network', texts.network, true, { cause: error });
}

function acceptedStatus(options: Pick<JsonRequestOptions<unknown>, 'acceptStatus'>, response: Response): boolean {
  return options.acceptStatus ? options.acceptStatus(response.status) : response.ok;
}

async function requestData<T>(options: JsonRequestOptions<T>, read: (response: Response) => Promise<unknown>, source: string): Promise<T> {
  const { path, schema, fetcher, baseUrl, error, label } = options;
  const timeoutMs = options.timeoutMs ?? 12_000;
  const totalAttempts = options.totalAttempts ?? 2;
  const schemaMessage = options.messages?.schema ?? `${label}数据结构与已验证契约不一致`;
  const timeoutMessage = options.messages?.timeout ?? `${label}数据读取超时`;
  const networkMessage = options.messages?.network ?? `无法连接${label}服务`;
  let previousError: ProviderError | null = null;
  const operationId = nextRuntimeOperationId();
  const diagnostic = { source, scenario: options.diagnosticScenario, operationId, parentOperationId: options.diagnosticParentOperationId };
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
      const url = `${baseUrl}${path}`;
      const request = providerRequestInit(options.init, options.authenticated, controller.signal);
      const sensitive = request.sensitive;
      if (sensitive && new URL(url).origin !== new URL(baseUrl).origin) {
        throw new ProviderError('permission', '凭据请求地址不属于当前服务', false);
      }
      const response = await abortable(fetcher(url, request.init), controller.signal);
      assertRequestActive(options.signal);
      assertProviderResponseOrigin(response, url, sensitive);
      status = response.status;
      if (!acceptedStatus(options, response)) {
        const mapped = options.onHttpError
          ? await options.onHttpError(boundedResponse(response, { maxBytes: options.maxResponseBytes, signal: controller.signal }))
          : error(response.status);
        if (!options.onHttpError) void response.body?.cancel().catch(() => undefined);
        diagnosticError = mapped;
        const willRetry = attempt + 1 < totalAttempts;
        if (mapped.retryable && willRetry) {
          previousError = mapped;
          if (response.status === 429) await pause(retryAfterMs(response), options.signal);
          result = 'retry';
          continue;
        }
        throw mapped;
      }
      const data = schema.parse(await abortable(read(boundedResponse(response, {
        maxBytes: options.maxResponseBytes, signal: controller.signal,
      })), controller.signal));
      assertRequestActive(options.signal);
      await options.onResponse?.(response);
      assertRequestActive(options.signal);
      result = 'success';
      return data;
    } catch (caught) {
      diagnosticError = caught;
      if (options.signal?.aborted) result = 'cancelled';
      if (options.signal?.aborted) throw options.signal.reason;
      if (caught instanceof ProviderError || caught instanceof SessionPersistenceError) throw caught;
      const normalized = normalizeExecutionError(caught, controller.signal.aborted, {
        schema: schemaMessage, timeout: timeoutMessage, network: networkMessage,
      });
      diagnosticError = normalized;
      if (normalized.code === 'upstream_schema') throw normalized;
      if (attempt + 1 < totalAttempts) { previousError = normalized; result = 'retry'; continue; }
      throw normalized;
    } finally {
      void recordRuntimeDiagnostic('request', {
        ...diagnostic, result, status, attempt: attempt + 1, durationMs: Date.now() - started,
        severity: result === 'retry' ? 'warn' : undefined,
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

/** 未知写入结果不能自动重发。 */
export async function requestProviderWrite<T>(options: JsonRequestOptions<T>, read: (response: Response) => Promise<unknown>): Promise<
  { status: 'success'; data: T } | { status: 'unconfirmed' }
> {
  let sent = false;
  let status: number | undefined;
  const fetcher = options.fetcher ?? expoFetch as unknown as typeof fetch;
  try {
    const data = await requestProviderResponse({ ...options, totalAttempts: 1, fetcher: async (...args) => {
      sent = true;
      const response = await fetcher(...args);
      status = response.status;
      return response;
    } }, read);
    return { status: 'success', data };
  } catch (error) {
    if (options.signal?.aborted) throw options.signal.reason ?? error;
    if (!sent || (status !== undefined && status >= 400 && status < 500)) throw error;
    return { status: 'unconfirmed' };
  }
}

export function requestBytes(options: Omit<JsonRequestOptions<Uint8Array>, 'schema'>): Promise<Uint8Array> {
  return requestData({ ...options, schema: z.instanceof(Uint8Array) },
    async (response) => new Uint8Array(await response.arrayBuffer()), 'request-bytes');
}

export type ProviderJsonOptions = {
  diagnosticScenario?: RuntimeRequestScenario;
  diagnosticParentOperationId?: number;
  baseUrl: string;
  path: string;
  invalidJsonMessage: string;
  timeoutMessage: string;
  networkMessage: string;
  signal?: AbortSignal;
};

export function fetchProviderJson(options: ProviderJsonOptions): Promise<unknown> {
  return requestData({
    baseUrl: options.baseUrl,
    path: options.path,
    schema: z.unknown(),
    fetcher: expoFetch as unknown as FetchLike,
    signal: options.signal,
    diagnosticScenario: options.diagnosticScenario,
    diagnosticParentOperationId: options.diagnosticParentOperationId,
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
