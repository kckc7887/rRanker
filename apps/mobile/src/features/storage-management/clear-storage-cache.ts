import type { QueryClient } from '@tanstack/react-query';
import { queryClient } from '@/state/query-client';
import type { StorageClearCategoryId } from '@/storage/storage-clear-prefs-store';
import { compactRrankerDatabase } from '@/storage/rranker-database';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';
import {
  clearSharedCache,
  getGameStorageAdapter,
  type GameStorageAdapter,
} from '@/features/storage-management/game-storage-adapters';
import { measureManagedStorageBytes } from '@/features/storage-management/storage-usage';
import { clearGameRemoteImageCache } from '@/services/remote-image-cache';

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

  for (const id of unique) {
    try {
      if (id === 'shared') {
        await clearSharedCache();
        clearedIds.push(id);
        continue;
      }
      const adapter = getGameStorageAdapter(id);
      if (!adapter) {
        failures.push(String(id));
        continue;
      }
      await Promise.all([
        adapter.clear(snapshots),
        clearGameRemoteImageCache(id),
      ]);
      clearedIds.push(id);
    } catch {
      failures.push(id === 'shared' ? '共享缓存' : String(id));
    }
  }

  if (clearedIds.length > 0) {
    for (const id of clearedIds) {
      if (id === 'shared') continue;
      const adapter = getGameStorageAdapter(id);
      if (!adapter) continue;
      client.removeQueries({ predicate: (query) => adapterOwnsQuery(adapter, query.queryKey) });
      adapter.resetMemory?.();
    }
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
