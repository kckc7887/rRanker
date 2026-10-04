import { MAIMAI_FONT_CACHE_VERSION } from '@/features/best-image/maimai-font-cache';
import { MAIMAI_UI_CACHE_VERSION } from '@/features/best-image/maimai-ui-cache';
import { PHIGROS_FONT_CACHE_VERSION } from '@/features/phigros-best-image/phigros-font-cache';
import { isTemporaryCacheEntry } from './cache-policy';
import {
  APP_CACHE_ROOT,
  MAIMAI_ASSETS_ROOT,
  PHIGROS_FONT_ROOT,
  PHIGROS_ILLUSTRATION_ROOT,
  clearDirectoryContentsStrict,
  pruneVersionedAssetRoot,
} from './fs-storage';
import { isExpoSystemCacheEntry } from './expo-system-cache';
import { pruneRemoteImageCache } from '@/services/remote-image-cache';

let maintenancePromise: Promise<void> | null = null;

/** 每次启动都回收上次异常退出遗留的会话文件，并保留当前版本不可替代的字体/UI 素材。 */
export function cleanupOrphanedTemporaryStorage(): void {
  clearDirectoryContentsStrict(APP_CACHE_ROOT(), {
    skip: (name) => isExpoSystemCacheEntry(name) || !isTemporaryCacheEntry(name),
  });
  const illustrationRoot = PHIGROS_ILLUSTRATION_ROOT();
  if (illustrationRoot.exists) illustrationRoot.delete();
  pruneVersionedAssetRoot(MAIMAI_ASSETS_ROOT(), [MAIMAI_UI_CACHE_VERSION, MAIMAI_FONT_CACHE_VERSION]);
  pruneVersionedAssetRoot(PHIGROS_FONT_ROOT(), [PHIGROS_FONT_CACHE_VERSION]);
}

/** 首帧后非阻塞调用；同一进程内并发入口共享一次任务。 */
export function runStorageCacheMaintenance(): Promise<void> {
  if (!maintenancePromise) {
    maintenancePromise = (async () => {
      cleanupOrphanedTemporaryStorage();
      await pruneRemoteImageCache();
    })().finally(() => { maintenancePromise = null; });
  }
  return maintenancePromise;
}
