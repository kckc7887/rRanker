import type { DataSource } from '@/domain/models';
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
 */
export function isCacheFallback<T extends Sourced>(value: T): boolean {
  return value.source.kind === 'cache' || value.source.isStale === true;
}

/**
 * 缓存优先组合器：先渲染本地缓存（打标），后台网络刷新成功后回写；
 * 网络失败返回的兜底缓存不回写；无本地缓存时直接走网络。
 * 各游戏差异（读缓存/刷新方式、持久化）由调用方提供，新游戏接入复用本组合器即可。
 */
export async function cacheFirstLoad<T extends Sourced>(options: {
  loadCached: () => Promise<T | null>;
  loadFresh: (signal: AbortSignal) => Promise<T>;
  onFresh: (fresh: T) => void;
  markStale?: (value: T) => T;
  signal?: AbortSignal;
}): Promise<T> {
  const signal = options.signal ?? getForegroundAbortSignal();
  if (signal.aborted) throw new Error('cache first load aborted');
  const cached = await options.loadCached();
  if (signal.aborted) throw new Error('cache first load aborted');
  if (cached) {
    void options.loadFresh(signal).then((fresh) => {
      if (!signal.aborted && !isCacheFallback(fresh)) options.onFresh(fresh);
    }).catch(() => undefined);
    const mark = options.markStale ?? ((value: T) => staleCached(value));
    return mark(cached);
  }
  const fresh = await options.loadFresh(signal);
  if (signal.aborted) throw new Error('cache first load aborted');
  return fresh;
}
