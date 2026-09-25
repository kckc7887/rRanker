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

type Sourced = { source: DataSource };

function markSource(source: DataSource, label?: string): DataSource {
  if (source.kind === 'cache') return source;
  return {
    ...source,
    kind: 'cache',
    isStale: true,
    ...(label ? { label } : {}),
  };
}

/**
 * 缓存优先渲染时的来源标记：label 原样保留（可覆盖，如中二「落雪咖啡屋（缓存）」），
 * 仅标记为缓存且过期（后台刷新中），UI 据此显示「数据可能过期」，刷新完成后自动恢复。
 * 可直接对 DataSource 打标，也可对含 source 字段的对象打标。
 */
export function staleCached(source: DataSource, options?: { label?: string }): DataSource;
export function staleCached<T extends Sourced>(value: T, options?: { label?: string }): T;
export function staleCached(value: Sourced | DataSource, options?: { label?: string }): Sourced | DataSource {
  if ('source' in value) {
    if (value.source.kind === 'cache') return value;
    return { ...value, source: markSource(value.source, options?.label) };
  }
  return markSource(value, options?.label);
}

/**
 * 网络失败返回的兜底缓存数据判定（不应回写覆盖首屏缓存）。
 * 统一两种既有写法：maimai 兜底打 kind='cache'，中二兜底仅置 isStale=true。
 * 这是缺省判定；服务能自己声明时请传 `isFallback`，不要依赖来源标记推断。
 */
export function isCacheFallback<T extends Sourced>(value: T): boolean {
  return value.source.kind === 'cache' || value.source.isStale === true;
}

/** 后台刷新的请求范围：一次缓存优先加载只覆盖该实体自己的数据，曲库等粒度由调用方单独表达。 */
export type CacheFirstRefreshTarget = 'data';
export type CacheFirstRefreshResult<T> = RefreshResult<T, CacheFirstRefreshTarget>;

/**
 * 缓存优先加载的返回值：首屏数据 + 后台刷新的终态句柄。
 * `value` 供首屏渲染；`background` 在「网络读取、提交（onFresh/onFallback）与失败」全部落定后
 * 给出 `domain/refresh-result.ts` 的终态，调用方不必再猜一个 Promise 返回时完成了多少。
 */
export type CacheFirstLoad<T> = {
  value: T;
  background: Promise<CacheFirstRefreshResult<T>>;
};

export type CacheFirstLoadOptions<T extends Sourced> = {
  loadCached: () => Promise<T | null>;
  loadFresh: (signal: AbortSignal) => Promise<T>;
  /** 只有刷新真正取回新数据时调用。 */
  onFresh: (fresh: T) => void;
  /** 刷新没有提供新数据、但给出了可继续使用的缓存/兜底数据时调用。 */
  onFallback?: (fallback: T, failure: RefreshFailure | null) => void;
  /** 后台刷新失败时调用；只在刷新抛错时触发，取消后不再触发。 */
  onRefreshFailed?: (failure: RefreshFailure) => void;
  /**
   * 声明 `loadFresh` 的返回值是否来自本地快照。
   * 缺省按 DataSource 标记判断（`isCacheFallback`）；服务能给出准确答案时应显式声明。
   */
  isFallback?: (fresh: T) => boolean;
  markStale?: (value: T) => T;
  signal?: AbortSignal;
  assertCurrent?: () => void;
};

function settlementMetadata(source: DataSource): SnapshotMetadata | null {
  return source.kind === 'cache' ? null : snapshotMetadataOf(source);
}

/** 上游以 AbortError 表达的中止同样属于取消，不是刷新失败。 */
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

/**
 * 缓存优先组合器（含后台刷新终态句柄）：先渲染本地缓存（打标），后台网络刷新成功后回写；
 * 网络失败返回的兜底缓存不回写；无本地缓存时直接走网络。
 * 各游戏差异（读缓存/刷新方式、持久化）由调用方提供，新游戏接入复用本组合器即可。
 *
 * 刷新结果分工（缓存命中与兜底都不是刷新成功）：
 * - 只有取回新数据的刷新才进入 `onFresh`；
 * - 服务声明为缓存/兜底（`isFallback`）的结果进入 `onFallback`，第二个参数是机器可判定的
 *   失败原因，服务没有交出原因时为 null；
 * - 刷新直接抛错时进入 `onRefreshFailed`，携带机器错误码，调用端不必读错误文案；
 * - 取消后两者都不发布，终态为 `cancelled`。
 *
 * 取消语义分两层，调用方必须分清：
 * - 「取消一个消费者」= 该消费者自己的 `signal` 中止（或 `assertCurrent` 失效）：本次调用不再发布、
 *   终态为 `cancelled`，但共享底层任务的其它消费者照常拿到数据（`createInflightGuard.share` 计数）；
 * - 「取消整个操作」= 最后一个消费者离开、或缓存清理提升代次并中止共享任务：所有等待者一起停止，
 *   不会有任何迟到数据被提交。
 */
export async function cacheFirstLoadWithBackground<T extends Sourced>(
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
    // 句柄永不 reject：终态一律用 RefreshResult 表达，调用方不需要额外 catch。
    const background = options.loadFresh(signal).then(
      (fresh): CacheFirstRefreshResult<T> => {
        try {
          assertCurrent();
        } catch {
          return cancelledRefresh<T, CacheFirstRefreshTarget>(dataRequested);
        }
        if (signal.aborted) return cancelledRefresh<T, CacheFirstRefreshTarget>(dataRequested);
        if (isFallback(fresh)) {
          // 兜底发布失败不改变「本次没有取回新数据」这一事实。
          try { options.onFallback?.(fresh, null); } catch { /* 终态仍按兜底表达 */ }
          return fallbackSettlement(fresh);
        }
        try {
          options.onFresh(fresh);
        } catch (error) {
          // 数据已取回但提交失败：不能报告成本次刷新成功。
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
        // 取消、失效与订阅方自身的异常都不算刷新失败。
        if (signal.aborted || isCancellation(error)) {
          return cancelledRefresh<T, CacheFirstRefreshTarget>(dataRequested);
        }
        try {
          assertCurrent();
        } catch {
          return cancelledRefresh<T, CacheFirstRefreshTarget>(dataRequested);
        }
        // 回调沿用既有形状（target 为 null）；终态句柄补上本次请求的唯一范围。
        const failure = refreshFailureFromError(error);
        options.onRefreshFailed?.(failure);
        return failedRefresh<T, CacheFirstRefreshTarget>({
          requested: dataRequested,
          failures: [{ ...failure, target: 'data' }],
        });
      },
    );
    const mark = options.markStale ?? ((value: T) => staleCached(value));
    return { value: mark(cached), background };
  }
  const fresh = await options.loadFresh(signal);
  if (signal.aborted) throw new Error('cache first load aborted');
  assertCurrent();
  return { value: fresh, background: Promise.resolve(successfulSettlement(fresh)) };
}

/**
 * 缓存优先组合器的首屏入口：只取首屏返回值，后台刷新的终态由实现内部按既有回调发布。
 * 需要等待「本次刷新到底完成了多少」的调用方请改用 `cacheFirstLoadWithBackground`。
 */
export async function cacheFirstLoad<T extends Sourced>(options: CacheFirstLoadOptions<T>): Promise<T> {
  const load = await cacheFirstLoadWithBackground(options);
  // 终态句柄不会 reject；这里只保证未消费的句柄不产生未处理拒绝。
  void load.background.catch(() => undefined);
  return load.value;
}
