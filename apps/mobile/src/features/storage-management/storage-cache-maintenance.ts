import Storage from 'expo-sqlite/kv-store';
import { Image } from 'expo-image';
import { MAIMAI_FONT_CACHE_VERSION } from '@/features/best-image/maimai-font-cache';
import { MAIMAI_UI_CACHE_VERSION } from '@/features/best-image/maimai-ui-cache';
import { PHIGROS_FONT_CACHE_VERSION } from '@/features/phigros-best-image/phigros-font-cache';
import { compactRrankerDatabase } from '@/storage/rranker-database';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';
import { isSessionOnlyResourceKey, isTemporaryCacheEntry } from './cache-policy';
import {
  APP_CACHE_ROOT,
  MAIMAI_ASSETS_ROOT,
  OSU_MOD_ICONS_ROOT,
  PHIGROS_FONT_ROOT,
  PHIGROS_ILLUSTRATION_ROOT,
  clearDirectoryContentsStrict,
  pruneVersionedAssetRoot,
} from './fs-storage';
import { isExpoSystemCacheEntry } from './expo-system-cache';
import { pruneRemoteImageCache } from '@/services/remote-image-cache';

const STORAGE_CACHE_MIGRATION_KEY = 'rranker.storage-cache-policy.v1';
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

/**
 * 一次性删除旧版公开数据/图片缓存。个人曲库、账号、凭据、本地成绩、玩家核心快照均不匹配此表。
 * 迁移未完整成功时不写标记，下次启动继续重试。
 */
export async function migrateLegacyStorageCaches(
  snapshots = new SqliteSnapshotRepository(),
): Promise<void> {
  if (await Storage.getItem(STORAGE_CACHE_MIGRATION_KEY) === 'done') return;

  const sessionOnlyKeys = (await snapshots.listResourceSizes())
    .map((row) => row.key)
    .filter(isSessionOnlyResourceKey);
  await snapshots.clearResources(sessionOnlyKeys);
  await snapshots.clearCatalog();

  const osuIcons = OSU_MOD_ICONS_ROOT();
  if (osuIcons.exists) osuIcons.delete();

  const imageCacheCleared = await Image.clearDiskCache();
  await Image.clearMemoryCache();
  if (imageCacheCleared !== true) throw new Error('原生图片磁盘缓存未能完成清理');

  await compactRrankerDatabase();
  await Storage.setItem(STORAGE_CACHE_MIGRATION_KEY, 'done');
}

/** 首帧后非阻塞调用；同一进程内并发入口共享一次任务。 */
export function runStorageCacheMaintenance(): Promise<void> {
  if (!maintenancePromise) {
    maintenancePromise = (async () => {
      cleanupOrphanedTemporaryStorage();
      await migrateLegacyStorageCaches();
      await pruneRemoteImageCache();
    })().finally(() => { maintenancePromise = null; });
  }
  return maintenancePromise;
}
