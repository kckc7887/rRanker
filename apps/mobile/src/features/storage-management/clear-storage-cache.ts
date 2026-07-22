import type { QueryClient } from '@tanstack/react-query';
import { invalidateAccountDataQueries } from '@/services/invalidate-account-data';
import { queryClient } from '@/state/query-client';
import type { StorageClearCategoryId } from '@/storage/storage-clear-prefs-store';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';
import {
  clearSharedCache,
  getGameStorageAdapter,
} from '@/features/storage-management/game-storage-adapters';

const snapshots = new SqliteSnapshotRepository();

export type ClearStorageResult = {
  clearedIds: StorageClearCategoryId[];
  failures: string[];
};

export async function clearStorageByCategories(
  selectedIds: readonly StorageClearCategoryId[],
  client: QueryClient = queryClient,
): Promise<ClearStorageResult> {
  const unique = [...new Set(selectedIds)];
  const clearedIds: StorageClearCategoryId[] = [];
  const failures: string[] = [];

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
      await adapter.clear(snapshots);
      clearedIds.push(id);
    } catch {
      failures.push(id === 'shared' ? '共享缓存' : String(id));
    }
  }

  if (clearedIds.length > 0) {
    await invalidateAccountDataQueries(client, 'active');
    for (const key of ['score-snapshot', 'game-data', 'songs', 'detailed-catalog', 'plates', 'collections']) {
      client.removeQueries({ queryKey: [key] });
    }
  }

  return { clearedIds, failures };
}
