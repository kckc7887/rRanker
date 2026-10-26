import type { QueryClient } from '@tanstack/react-query';
import { queryClient } from '@/state/query-client';
import type { StorageClearCategoryId } from '@/storage/storage-clear-prefs-store';
import { compactRrankerDatabase } from '@/storage/rranker-database';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';
import {
  clearSharedCache,
  collectStorageMeasurementInventory,
  getGameStorageAdapter,
  type GameStorageAdapter,
} from '@/features/storage-management/game-storage-adapters';
import { measureManagedStorageBytes } from '@/features/storage-management/storage-usage';
import { clearGameRemoteImageCache } from '@/services/remote-image-cache';
import { invalidateResourceWrites } from '@/services/snapshot-cache-utils';
import { recordRuntimeError } from '@/services/runtime-diagnostics-recorder';

const snapshots = new SqliteSnapshotRepository();

export type ClearStorageResult = {
  clearedIds: StorageClearCategoryId[];
  failures: string[];
  reclaimedBytes: number | null;
};

function startsWithQueryKey(queryKey: readonly unknown[], prefix: readonly unknown[]): boolean {
  return prefix.every((part, index) => queryKey[index] === part);
}

function adapterOwnsQuery(adapter: GameStorageAdapter, queryKey: readonly unknown[]): boolean {
  if (!adapter.queryKeys.some((prefix) => startsWithQueryKey(queryKey, prefix))) return false;
  if (queryKey[0] === 'score-snapshot') return queryKey[2] === adapter.gameId;
  if (queryKey[0] === 'game-data') return queryKey[3] === adapter.gameId;
  if (typeof queryKey[0] === 'string' && queryKey[0].startsWith('osu-')) {
    return queryKey.includes(adapter.gameId);
  }
  return true;
}

export async function clearStorageByCategories(
  selectedIds: readonly StorageClearCategoryId[],
  client: QueryClient = queryClient,
): Promise<ClearStorageResult> {
  const unique = [...new Set(selectedIds)];
  const clearedIds: StorageClearCategoryId[] = [];
  const failures: string[] = [];
  const beforeBytes = await measureManagedStorageBytes().catch(() => null);
  const readyAdapters = new Map<StorageClearCategoryId, GameStorageAdapter>();

  for (const id of unique) {
    if (id === 'shared') continue;
    const adapter = getGameStorageAdapter(id);
    if (adapter) invalidateResourceWrites(id);
  }
  for (const id of unique) {
    if (id === 'shared') continue;
    const adapter = getGameStorageAdapter(id);
    if (!adapter) { failures.push(String(id)); continue; }
    try {
      const ownedQueries = { predicate: (query: { queryKey: readonly unknown[] }) => adapterOwnsQuery(adapter, query.queryKey) };
      await client.cancelQueries(ownedQueries);
      client.removeQueries(ownedQueries);
      adapter.resetMemory?.();
      readyAdapters.set(id, adapter);
    } catch {
      failures.push(String(id));
    }
  }
  const inventory = readyAdapters.size > 0
    ? await collectStorageMeasurementInventory(snapshots).catch((error) => {
      recordRuntimeError('storage-clear', error, false, { phase: 'inventory' });
      return null;
    })
    : null;

  for (const id of unique) {
    try {
      if (id === 'shared') {
        const result = await clearSharedCache();
        failures.push(...result.failures);
        clearedIds.push(id);
        continue;
      }
      const adapter = readyAdapters.get(id);
      if (!adapter) continue;
      if (!inventory) {
        failures.push(String(id));
        continue;
      }
      const results = await Promise.allSettled([
        Promise.resolve().then(() => adapter.clear(snapshots, inventory)),
        Promise.resolve().then(() => clearGameRemoteImageCache(id)),
      ]);
      let failed = false;
      results.forEach((result, index) => {
        if (result.status !== 'rejected') return;
        failed = true;
        recordRuntimeError('storage-clear', result.reason, false, { phase: index === 0 ? 'resource-cleanup' : 'image-cleanup' });
      });
      if (failed) { failures.push(String(id)); continue; }
      clearedIds.push(id);
    } catch {
      failures.push(id === 'shared' ? '共享缓存' : String(id));
    }
  }

  if (clearedIds.length > 0) {
    try {
      await compactRrankerDatabase();
    } catch {
      failures.push('SQLite 压缩');
    }
  }

  const afterBytes = await measureManagedStorageBytes().catch(() => null);
  const reclaimedBytes = beforeBytes === null || afterBytes === null
    ? null
    : Math.max(0, beforeBytes - afterBytes);
  return { clearedIds, failures, reclaimedBytes };
}
