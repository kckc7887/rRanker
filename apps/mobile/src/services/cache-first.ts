import type { DataSource } from '@/domain/models';
import type { RefreshFailure, RefreshResult, SnapshotMetadata } from '@/domain/refresh-result';
import {
  cancelledRefresh,
  failedRefresh,
  refreshFailureFromError,
  snapshotMetadataOf,
  successfulRefresh,
} from '@/domain/refresh-result';
import { getForegroundAbortSignal } from '@/state/app-lifecycle-core';
import { createRuntimeOperation } from './runtime-diagnostics-recorder';

type Sourced = { source: DataSource };

function markSource(source: DataSource, label?: string): DataSource {
  if (source.kind === 'cache') return source;
  return {
    ...source,
    isStale: true,
    ...(label ? { label } : {}),
  };
}

export function staleCached(source: DataSource, options?: { label?: string }): DataSource;
export function staleCached<T extends Sourced>(value: T, options?: { label?: string }): T;
export function staleCached(value: Sourced | DataSource, options?: { label?: string }): Sourced | DataSource {
  if ('source' in value) {
    if (value.source.kind === 'cache') return value;
    return { ...value, source: markSource(value.source, options?.label) };
  }
  return markSource(value, options?.label);
}

export function isCacheFallback<T extends Sourced>(value: T): boolean {
  return value.source.kind === 'cache' || value.source.isStale === true;
}

export type CacheFirstRefreshTarget = 'data';
export type CacheFirstRefreshResult<T> = RefreshResult<T, CacheFirstRefreshTarget>;

/** background 等待网络读取和回调提交结束。 */
export type CacheFirstLoad<T> = {
  value: T;
  background: Promise<CacheFirstRefreshResult<T>>;
};

export type CacheFirstLoadOptions<T extends Sourced> = {
  loadCached: () => Promise<T | null>;
  loadFresh: (signal: AbortSignal) => Promise<T>;
  onFresh: (fresh: T) => unknown;
  onFallback?: (fallback: T, failure: RefreshFailure | null) => unknown;
  onRefreshFailed?: (failure: RefreshFailure) => void;
  isFallback?: (fresh: T) => boolean;
  markStale?: (value: T) => T;
  signal?: AbortSignal;
  assertCurrent?: () => void;
  diagnosticParentOperationId?: number;
};

function settlementMetadata(source: DataSource): SnapshotMetadata | null {
  return source.kind === 'cache' ? null : snapshotMetadataOf(source);
}

function isCancellation(error: unknown): boolean {
  return typeof error === 'object' && error !== null
    && (error as { name?: unknown }).name === 'AbortError';
}

const dataRequested: readonly CacheFirstRefreshTarget[] = ['data'];

function successfulSettlement<T extends Sourced>(value: T): CacheFirstRefreshResult<T> {
  const metadata = settlementMetadata(value.source);
  return metadata
    ? successfulRefresh({ value, metadata, requested: dataRequested })
    : failedRefresh({ value, requested: dataRequested });
}

function fallbackSettlement<T extends Sourced>(value: T): CacheFirstRefreshResult<T> {
  return failedRefresh({
    value,
    metadata: settlementMetadata(value.source),
    requested: dataRequested,
    failures: [{
      code: 'no_data',
      target: 'data',
      diagnostic: '刷新只返回了本地缓存或兜底数据',
      retryable: true,
    }],
  });
}

async function loadCacheFirst<T extends Sourced>(
  options: CacheFirstLoadOptions<T>,
): Promise<CacheFirstLoad<T>> {
  const assertCurrent = options.assertCurrent ?? (() => undefined);
  assertCurrent();
  const signal = options.signal ?? getForegroundAbortSignal();
  if (signal.aborted) throw new Error('cache first load aborted');
  const isFallback = options.isFallback ?? isCacheFallback;
  const cached = await options.loadCached();
  if (signal.aborted) throw new Error('cache first load aborted');
  assertCurrent();
  if (cached) {
    const background = Promise.resolve().then(() => options.loadFresh(signal)).then(
      async (fresh): Promise<CacheFirstRefreshResult<T>> => {
        try {
          assertCurrent();
        } catch {
          return cancelledRefresh<T, CacheFirstRefreshTarget>(dataRequested);
        }
        if (signal.aborted) return cancelledRefresh<T, CacheFirstRefreshTarget>(dataRequested);
        if (isFallback(fresh)) {
          try { await options.onFallback?.(fresh, null); } catch {}
          return fallbackSettlement(fresh);
        }
        try {
          await options.onFresh(fresh);
          assertCurrent();
          if (signal.aborted) return cancelledRefresh<T, CacheFirstRefreshTarget>(dataRequested);
        } catch (error) {
          if (signal.aborted || isCancellation(error)) return cancelledRefresh<T, CacheFirstRefreshTarget>(dataRequested);
          return failedRefresh({
            value: fresh,
            metadata: settlementMetadata(fresh.source),
            requested: dataRequested,
            failures: [refreshFailureFromError(error, 'data')],
          });
        }
        return successfulSettlement(fresh);
      },
      (error: unknown): CacheFirstRefreshResult<T> => {
        if (signal.aborted || isCancellation(error)) {
          return cancelledRefresh<T, CacheFirstRefreshTarget>(dataRequested);
        }
        try {
          assertCurrent();
        } catch {
          return cancelledRefresh<T, CacheFirstRefreshTarget>(dataRequested);
        }
        const failure = refreshFailureFromError(error);
        try { options.onRefreshFailed?.(failure); } catch {}
        return failedRefresh<T, CacheFirstRefreshTarget>({
          requested: dataRequested,
          failures: [{ ...failure, target: 'data' }],
        });
      },
    ).catch((error: unknown) => signal.aborted || isCancellation(error)
      ? cancelledRefresh<T, CacheFirstRefreshTarget>(dataRequested)
      : failedRefresh<T, CacheFirstRefreshTarget>({ requested: dataRequested,
        failures: [refreshFailureFromError(error, 'data')] }));
    const mark = options.markStale ?? ((value: T) => staleCached(value));
    return { value: mark(cached), background };
  }
  const fresh = await options.loadFresh(signal);
  if (signal.aborted) throw new Error('cache first load aborted');
  assertCurrent();
  return { value: fresh, background: Promise.resolve(isFallback(fresh)
    ? fallbackSettlement(fresh) : successfulSettlement(fresh)) };
}

export async function cacheFirstLoadWithBackground<T extends Sourced>(options: CacheFirstLoadOptions<T>): Promise<CacheFirstLoad<T>> {
  const operation = createRuntimeOperation('cache-first', { parentOperationId: options.diagnosticParentOperationId });
  const signal = options.signal ?? getForegroundAbortSignal();
  operation.record('cache-read');
  try {
    const load = await loadCacheFirst({
      ...options,
      signal,
      loadCached: async () => {
        const cached = await options.loadCached();
        operation.record('cache-read-complete', { cacheCount: cached ? 1 : 0, result: cached ? 'hit' : 'miss' });
        return cached;
      },
      loadFresh: async signal => {
        operation.record('refresh');
        const fresh = await options.loadFresh(signal);
        operation.record('refresh-complete');
        return fresh;
      },
      onFresh: async fresh => {
        operation.record('cache-publish');
        await options.onFresh(fresh);
        operation.record('cache-publish-complete');
      },
    });
    return { value: load.value, background: load.background.then(result => {
      operation.record('settled', { result: result.status,
        errorCode: result.status === 'cancelled' ? 'cancelled' : result.failures[0]?.code,
        severity: result.value?.source.isStale || result.value?.source.kind === 'cache' ? 'warn' : undefined });
      return result;
    }) };
  } catch (error) {
    operation.record('settled', { result: signal.aborted || isCancellation(error) ? 'cancelled' : 'failed', error });
    throw error;
  }
}

export async function cacheFirstLoad<T extends Sourced>(options: CacheFirstLoadOptions<T>): Promise<T> {
  const load = await cacheFirstLoadWithBackground(options);
  void load.background.catch(() => undefined);
  return load.value;
}
