import type { DataSource } from '@/domain/models';
import { DataSourceSchema } from '@/domain/schemas';
import { z } from 'zod';
import { cachedSnapshotSource } from '@/domain/refresh-result';
import type { ResourceMaintenanceRepository } from '@/repositories/resource-repository';

export function cacheSourceSchema<K extends DataSource['kind']>(kind: K) {
  return DataSourceSchema.extend({ kind: z.literal(kind) });
}

export function parseCachedSnapshot<T>(stored: unknown, kind: DataSource['kind'], dataSchema: z.ZodType<T>): { data: T; source: DataSource } | null {
  const parsed = z.object({ data: dataSchema, source: cacheSourceSchema(kind) }).safeParse(stored);
  return parsed.success ? { ...parsed.data, source: cachedSnapshotSource(parsed.data.source) } : null;
}

const resourceWriteGenerations = new Map<string, number>();
const resourceWriteListeners = new Map<string, Set<() => void>>();
export function resourceWriteGeneration(scope: string): number {
  return resourceWriteGenerations.get(scope) ?? 0;
}
export function invalidateResourceWrites(scope: string): void {
  resourceWriteGenerations.set(scope, (resourceWriteGenerations.get(scope) ?? 0) + 1);
  for (const notify of [...(resourceWriteListeners.get(scope) ?? [])]) {
    try { notify(); } catch {}
  }
}
export function subscribeResourceWrites(scope: string, onInvalidate: () => void): () => void {
  let listeners = resourceWriteListeners.get(scope);
  if (!listeners) {
    listeners = new Set();
    resourceWriteListeners.set(scope, listeners);
  }
  const subscription = () => onInvalidate();
  listeners.add(subscription);
  return () => {
    listeners.delete(subscription);
    if (listeners.size === 0 && resourceWriteListeners.get(scope) === listeners) {
      resourceWriteListeners.delete(scope);
    }
  };
}
export function captureAccountWrites(
  accounts: readonly { id: string; gameId: string }[],
): (accountId: string) => void {
  const guards = new Map<string, () => void>();
  for (const account of accounts) {
    if (!guards.has(account.id)) {
      guards.set(account.id, captureResourceWrites(account.gameId, undefined, account.id));
    }
  }
  return (accountId: string) => {
    const assertCurrent = guards.get(accountId);
    if (!assertCurrent) throw new Error('缓存请求已失效');
    assertCurrent();
  };
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

export function snapshotSource(
  source: Pick<DataSource, 'kind' | 'label'>,
  updatedAt = new Date().toISOString(),
): DataSource {
  return { ...source, updatedAt, isStale: false };
}

export function makeSnapshot<T>(
  data: T,
  source: Pick<DataSource, 'kind' | 'label'>,
  updatedAt = new Date().toISOString(),
): { data: T; source: DataSource } {
  return { data, source: snapshotSource(source, updatedAt) };
}

export interface InflightGuard<K> {
  dedupe<T>(key: K, loader: () => Promise<T>, signal?: AbortSignal): Promise<T>;
  /** 仅最后一个消费者取消时中止共享请求。 */
  share<T>(key: K, loader: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T>;
  clear(): void;
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
  };
}

export async function clearResourcesByPrefix(
  repository: ResourceMaintenanceRepository,
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
