import { getGameStorageAdapters } from '@rranker/sdk/features/storage-management/game-storage-adapters';
import { isTemporaryCacheEntry } from '@rranker/sdk/features/storage-management/cache-policy';
import {
  APP_CACHE_ROOT,
  clearDirectoryContentsStrict,
  pruneVersionedAssetRoot,
  runSharedCacheFileOperation,
} from '@rranker/sdk/features/storage-management/fs-storage';
import { isExpoSystemCacheEntry } from '@rranker/sdk/features/storage-management/expo-system-cache';
import { pruneRemoteImageCache } from '@rranker/sdk/services/remote-image-cache';
import { isChartPreviewStageDirectoryInUse } from '@rranker/sdk/features/chart-preview-shared/chart-preview-assets';
import { Paths } from 'expo-file-system';

let maintenancePromise: Promise<void> | null = null;
const sessionStartedAt = Math.floor(Date.now() / 1000);

/** 回收上次会话文件，保留当前字体与 UI 素材。 */
export async function cleanupOrphanedTemporaryStorage(): Promise<void> {
  const cacheRoot = APP_CACHE_ROOT();
  await runSharedCacheFileOperation(() => clearDirectoryContentsStrict(cacheRoot, {
    skip: (name) => isExpoSystemCacheEntry(name) || !isTemporaryCacheEntry(name)
      || isChartPreviewStageDirectoryInUse(Paths.join(cacheRoot.uri, name)),
    modifiedBefore: sessionStartedAt,
  }));
  for (const resource of getGameStorageAdapters().flatMap(adapter => adapter.fileResources)) {
    if (resource.currentVersions) await pruneVersionedAssetRoot(resource.root(), resource.currentVersions, sessionStartedAt);
    else await runSharedCacheFileOperation(() => clearDirectoryContentsStrict(resource.root(), { modifiedBefore: sessionStartedAt }));
  }
}

export function runStorageCacheMaintenance(): Promise<void> {
  if (!maintenancePromise) {
    maintenancePromise = (async () => {
      await cleanupOrphanedTemporaryStorage();
      await pruneRemoteImageCache();
    })().finally(() => { maintenancePromise = null; });
  }
  return maintenancePromise;
}
