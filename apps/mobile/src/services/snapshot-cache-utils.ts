import type { DataSource } from '@/domain/models';
import type { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';

/** 构造缓存快照的 source：kind/label 由各游戏传入，updatedAt 记录本次拉取时间。 */
export function snapshotSource(
  source: Pick<DataSource, 'kind' | 'label'>,
  updatedAt = new Date().toISOString(),
): DataSource {
  return { ...source, updatedAt, isStale: false };
}

/** 构造缓存快照；source 的 updatedAt 记录本次拉取时间，供缓存命中时展示来源与过期标。 */
export function makeSnapshot<T>(
  data: T,
  source: Pick<DataSource, 'kind' | 'label'>,
  updatedAt = new Date().toISOString(),
): { data: T; source: DataSource } {
  return { data, source: snapshotSource(source, updatedAt) };
}

/** in-flight 去重守卫：并发调用同一 key 的加载共享一次网络请求，请求结束（成功或失败）后移除。 */
export interface InflightGuard<K> {
  dedupe<T>(key: K, loader: () => Promise<T>, signal?: AbortSignal): Promise<T>;
  /** 测试用：清空去重表。 */
  resetForTests(): void;
}

export function createInflightGuard<K>(): InflightGuard<K> {
  const inflight = new Map<K, { promise: Promise<unknown>; signal?: AbortSignal }>();
  return {
    dedupe<T>(key: K, loader: () => Promise<T>, signal?: AbortSignal): Promise<T> {
      const existing = inflight.get(key) as { promise: Promise<T>; signal?: AbortSignal } | undefined;
      if (existing && !existing.signal?.aborted) return existing.promise;
      const fresh = loader();
      inflight.set(key, { promise: fresh, signal });
      const cleanup = () => {
        if (inflight.get(key)?.promise === fresh) inflight.delete(key);
      };
      void fresh.then(cleanup, cleanup);
      return fresh;
    },
    resetForTests(): void {
      inflight.clear();
    },
  };
}

/**
 * 按精确 key 与前缀清理资源（解绑玩家时清理个人缓存，全局公开资源保留）：
 * 精确 key 无需扫描直接删除；前缀需遍历资源表匹配后一并批量删除。
 */
export async function clearResourcesByPrefix(
  repository: Pick<SqliteSnapshotRepository, 'listResourceSizes' | 'clearResources'>,
  targets: { keys?: readonly string[]; prefixes?: readonly string[] },
): Promise<void> {
  const matched = [...(targets.keys ?? [])];
  const prefixes = targets.prefixes ?? [];
  if (prefixes.length > 0) {
    for (const { key } of await repository.listResourceSizes()) {
      if (prefixes.some((prefix) => key.startsWith(prefix))) matched.push(key);
    }
  }
  if (matched.length > 0) await repository.clearResources(matched);
}
