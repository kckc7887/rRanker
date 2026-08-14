import type { QueryClient } from '@tanstack/react-query';
import { invalidateAccountDataQueries } from '@/services/invalidate-account-data';
import { resetPhigrosKyouAliasesCache } from '@/hooks/use-phigros-kyou';
import { queryClient } from '@/state/query-client';
import type { StorageClearCategoryId } from '@/storage/storage-clear-prefs-store';
import { compactRrankerDatabase } from '@/storage/rranker-database';
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
    for (const key of [
      'score-snapshot',
      'game-data',
      'songs',
      'detailed-catalog',
      'chunithm-catalog',
      'chunithm-song-detail',
      'chunithm-collections',
      'plates',
      'collections',
      'dxrating-chart-tags',
      'phira',
      'tuf',
      'musedash',
      'phigros-catalog',
      'phigros-kyou-chart-tags',
      'best-image-collections',
    ]) {
      client.removeQueries({ queryKey: [key] });
    }
    if (clearedIds.includes('phigros')) {
      resetPhigrosKyouAliasesCache();
    }
    // 只删行不缩文件；清完收尾压缩数据库文件，失败仅影响体积不影响清除结果。
    await compactRrankerDatabase().catch(() => undefined);
  }

  return { clearedIds, failures };
}
