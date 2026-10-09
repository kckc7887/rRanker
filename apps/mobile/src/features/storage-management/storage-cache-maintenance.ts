import { MAIMAI_FONT_CACHE_VERSION } from '@/features/best-image/maimai-font-cache';
import { MAIMAI_UI_CACHE_VERSION } from '@/features/best-image/maimai-ui-cache';
import { PHIGROS_FONT_CACHE_VERSION } from '@/features/phigros-best-image/phigros-font-cache';
import { isTemporaryCacheEntry } from './cache-policy';
import {
  APP_CACHE_ROOT,
  MAIMAI_ASSETS_ROOT,
  PHIGROS_FONT_ROOT,
  BEST_IMAGE_STAGE_ROOT,
  clearDirectoryContentsStrict,
  pruneVersionedAssetRoot,
  runSharedCacheFileOperation,
} from './fs-storage';
import { isExpoSystemCacheEntry } from './expo-system-cache';
import { pruneRemoteImageCache } from '@/services/remote-image-cache';
import { isChartPreviewStageDirectoryInUse } from '@/features/chart-preview-shared/chart-preview-assets';
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
  for (const game of ['maimai', 'chunithm', 'phigros'] as const) {
    await runSharedCacheFileOperation(() => clearDirectoryContentsStrict(BEST_IMAGE_STAGE_ROOT(game), { modifiedBefore: sessionStartedAt }));
  }
  await pruneVersionedAssetRoot(MAIMAI_ASSETS_ROOT(), [MAIMAI_UI_CACHE_VERSION, MAIMAI_FONT_CACHE_VERSION], sessionStartedAt);
  await pruneVersionedAssetRoot(PHIGROS_FONT_ROOT(), [PHIGROS_FONT_CACHE_VERSION], sessionStartedAt);
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
