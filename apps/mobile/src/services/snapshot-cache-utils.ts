import type { DataSource } from '@/domain/models';
import type { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';

const resourceWriteGenerations = new Map<string, number>();
export function resourceWriteGeneration(scope: string): number {
  return resourceWriteGenerations.get(scope) ?? 0;
}
/** Invalidates detached cache-first refreshes as well as active queries. */
export function invalidateResourceWrites(scope: string): void {
  resourceWriteGenerations.set(scope, (resourceWriteGenerations.get(scope) ?? 0) + 1);
}
export function captureResourceWrites(scope: string, signal?: AbortSignal, accountId?: string): () => void {
  const generation = resourceWriteGeneration(scope);
  const accountScope = accountId === undefined ? undefined : 'account:' + accountId;
  const accountGeneration = accountScope === undefined ? 0 : resourceWriteGeneration(accountScope);
  return () => {
    if (signal?.aborted) throw signal.reason ?? new Error('操作已取消');
    if (resourceWriteGeneration(scope) !== generation
      || (accountScope !== undefined && resourceWriteGeneration(accountScope) !== accountGeneration)) {
      throw new Error('缓存请求已失效');
    }
  };
}

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
  /** Each consumer cancels independently; only the last cancellation aborts the shared loader. */
  share<T>(key: K, loader: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T>;
  /** Abort shared work and forget in-flight entries when the owning cache is cleared. */
  clear(): void;
  /** 测试用：清空去重表。 */
  resetForTests(): void;
}

export function createInflightGuard<K>(): InflightGuard<K> {
  const inflight = new Map<K, { promise: Promise<unknown>; signal?: AbortSignal }>();
  const shared = new Map<K, { promise: Promise<unknown>; controller: AbortController; users: number }>();
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
    share<T>(key: K, loader: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T> {
      if (signal?.aborted) return Promise.reject(signal.reason ?? new Error('操作已取消'));
      let entry = shared.get(key);
      if (!entry || entry.controller.signal.aborted) {
        const controller = new AbortController();
        entry = { controller, users: 0, promise: Promise.resolve().then(() => {
          if (controller.signal.aborted) throw controller.signal.reason ?? new Error('操作已取消');
          return loader(controller.signal);
        }) };
        shared.set(key, entry);
        const current = entry;
        const cleanup = () => { if (shared.get(key) === current) shared.delete(key); };
        void entry.promise.then(cleanup, cleanup);
      }
      const current = entry;
      current.users++;
      return new Promise<T>((resolve, reject) => {
        let settled = false;
        const finish = () => {
          if (settled) return false;
          settled = true;
          signal?.removeEventListener('abort', cancel);
          current.users--;
          if (current.users === 0 && shared.get(key) === current) {
            shared.delete(key);
            current.controller.abort();
          }
          return true;
        };
        const cancel = () => { if (finish()) reject(signal?.reason ?? new Error('操作已取消')); };
        signal?.addEventListener('abort', cancel, { once: true });
        current.promise.then(value => { if (finish()) resolve(value as T); }, error => { if (finish()) reject(error); });
      });
    },
    clear(): void {
      inflight.clear();
      for (const entry of shared.values()) entry.controller.abort();
      shared.clear();
    },
    resetForTests(): void { this.clear(); },
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
