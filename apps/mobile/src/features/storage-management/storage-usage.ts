import type { StorageClearCategoryId } from '@/storage/storage-clear-prefs-store';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';
import { SqliteUserLibraryRepository } from '@/storage/sqlite-user-library-repository';
import { measureRrankerDatabaseAllocation } from '@/storage/rranker-database';
import {
  GAME_STORAGE_ADAPTERS,
  measureDurableLocalMaimaiBytes,
  measureSharedCacheBytes,
  type StorageSegmentId,
} from '@/features/storage-management/game-storage-adapters';
import {
  APP_CACHE_ROOT,
  APP_DOCUMENT_ROOT,
  MAIMAI_ASSETS_ROOT,
  OSU_MOD_ICONS_ROOT,
  PHIGROS_FONT_ROOT,
  PHIGROS_ILLUSTRATION_ROOT,
  measureDirectoryBytes,
  measureDirectoryBytesStrict,
} from '@/features/storage-management/fs-storage';
import { isManagedClearableCacheEntry } from '@/features/storage-management/expo-system-cache';
import { measureGameRemoteImageCacheBytes } from '@/services/remote-image-cache';

export type StorageUsageItem = {
  id: StorageSegmentId | 'basic-other';
  title: string;
  bytes: number;
  clearableBytes: number;
  precision: 'exact' | 'estimated';
  clearable: boolean;
  clearCategoryId: StorageClearCategoryId | null;
  color: string;
};

export type StorageUsageGroup = {
  id: 'basic' | 'cache';
  title: string;
  bytes: number;
  color: string;
  items: StorageUsageItem[];
};

export type StorageUsageReport = {
  groups: StorageUsageGroup[];
  totalBytes: number;
  clearableBytes: number;
  precision: 'estimated';
  sqliteAllocatedBytes: number;
  sqliteReclaimableBytes: number;
};

const GROUP_COLORS = {
  basic: '#94A3B8',
  cache: '#0EA5E9',
} as const;

const snapshots = new SqliteSnapshotRepository();
const library = new SqliteUserLibraryRepository();

export function listClearableCategoryIds(): StorageClearCategoryId[] {
  return [
    ...GAME_STORAGE_ADAPTERS.map((adapter) => adapter.gameId),
    'shared',
  ];
}

export type StorageUsageMeasurements = {
  libraryBytes: number;
  localMaimaiBytes: number;
  sharedClearableBytes: number;
  sqliteAllocatedBytes: number;
  sqliteLiveBytes: number;
  documentBytes: number;
  cacheRootBytes: number;
  gameBaseBytes: readonly number[];
  gameCoverBytes: readonly number[];
};

export function buildStorageUsageReport(
  measurements: StorageUsageMeasurements,
): StorageUsageReport {
  const {
    libraryBytes,
    localMaimaiBytes,
    sharedClearableBytes,
    sqliteAllocatedBytes,
    sqliteLiveBytes,
    documentBytes,
    cacheRootBytes,
    gameBaseBytes,
    gameCoverBytes,
  } = measurements;
  const sqliteReclaimableBytes = Math.max(0, sqliteAllocatedBytes - sqliteLiveBytes);
  const appBytes = libraryBytes + localMaimaiBytes;
  const measuredGameItems: StorageUsageItem[] = GAME_STORAGE_ADAPTERS.map((adapter, index) => {
    const bytes = (gameBaseBytes[index] ?? 0) + (gameCoverBytes[index] ?? 0);
    return {
      id: adapter.gameId,
      title: adapter.title,
      bytes,
      clearableBytes: bytes,
      precision: 'estimated',
      clearable: true,
      clearCategoryId: adapter.gameId,
      color: adapter.color,
    };
  });
  const measuredGameCacheBytes = measuredGameItems.reduce((sum, item) => sum + item.bytes, 0);
  const knownCacheBytes = cacheRootBytes
    + gameBaseBytes.reduce((sum, bytes) => sum + bytes, 0)
    + sqliteReclaimableBytes;
  const totalBytes = documentBytes + cacheRootBytes + sqliteAllocatedBytes;
  const cacheBytes = Math.min(totalBytes, Math.max(measuredGameCacheBytes, knownCacheBytes));
  const gameScale = measuredGameCacheBytes > cacheBytes && measuredGameCacheBytes > 0
    ? cacheBytes / measuredGameCacheBytes
    : 1;
  const gameItems = measuredGameItems.map((item) => ({
    ...item,
    bytes: item.bytes * gameScale,
    clearableBytes: item.clearableBytes * gameScale,
  }));
  const gameCacheBytes = gameItems.reduce((sum, item) => sum + item.bytes, 0);
  const basicBytes = Math.max(0, totalBytes - cacheBytes);
  const personalBytes = Math.min(appBytes, basicBytes);
  const sharedBytes = Math.max(0, cacheBytes - gameCacheBytes);
  const sharedItem: StorageUsageItem = {
    id: 'shared',
    title: '其它缓存',
    bytes: sharedBytes,
    clearableBytes: Math.min(sharedBytes, sharedClearableBytes + sqliteReclaimableBytes),
    precision: 'estimated',
    clearable: true,
    clearCategoryId: 'shared',
    color: GROUP_COLORS.cache,
  };
  const basicItems: StorageUsageItem[] = [
    {
      id: 'app',
      title: '账号与个人内容',
      bytes: personalBytes,
      clearableBytes: 0,
      precision: 'estimated',
      clearable: false,
      clearCategoryId: null,
      color: GROUP_COLORS.basic,
    },
    {
      id: 'basic-other',
      title: '设置和其它数据',
      bytes: Math.max(0, basicBytes - personalBytes),
      clearableBytes: 0,
      precision: 'estimated',
      clearable: false,
      clearCategoryId: null,
      color: '#CBD5E1',
    },
  ];
  const cacheItems = [...gameItems, sharedItem];
  const clearableBytes = cacheItems.reduce((sum, item) => sum + item.clearableBytes, 0);

  return {
    groups: [
      { id: 'basic', title: '基本数据', bytes: basicBytes, color: GROUP_COLORS.basic, items: basicItems },
      { id: 'cache', title: '缓存数据', bytes: cacheBytes, color: GROUP_COLORS.cache, items: cacheItems },
    ],
    totalBytes,
    clearableBytes,
    precision: 'estimated',
    sqliteAllocatedBytes,
    sqliteReclaimableBytes,
  };
}

export async function collectStorageUsage(): Promise<StorageUsageReport> {
  const [
    libraryBytes,
    localMaimaiBytes,
    sharedClearableBytes,
    sqliteAllocation,
    documentBytes,
    cacheRootBytes,
    gameBaseBytes,
    gameCoverBytes,
  ] = await Promise.all([
    library.measureBytes(),
    measureDurableLocalMaimaiBytes(snapshots),
    measureSharedCacheBytes(),
    measureRrankerDatabaseAllocation(),
    Promise.resolve(measureDirectoryBytes(APP_DOCUMENT_ROOT())),
    Promise.resolve(measureDirectoryBytes(APP_CACHE_ROOT())),
    Promise.all(GAME_STORAGE_ADAPTERS.map((adapter) => adapter.measure(snapshots))),
    Promise.all(GAME_STORAGE_ADAPTERS.map((adapter) => measureGameRemoteImageCacheBytes(adapter.gameId))),
  ]);
  return buildStorageUsageReport({
    libraryBytes,
    localMaimaiBytes,
    sharedClearableBytes,
    sqliteAllocatedBytes: sqliteAllocation.allocatedBytes,
    sqliteLiveBytes: sqliteAllocation.liveBytesEstimate,
    documentBytes,
    cacheRootBytes,
    gameBaseBytes,
    gameCoverBytes,
  });
}

/** 清理前后使用同一物理口径：SQLite 分配页 + 可管理文件目录。 */
export async function measureManagedStorageBytes(): Promise<number> {
  const sqlite = await measureRrankerDatabaseAllocation();
  return sqlite.allocatedBytes
    + measureDirectoryBytesStrict(APP_CACHE_ROOT(), { skip: (name) => !isManagedClearableCacheEntry(name) })
    + measureDirectoryBytesStrict(MAIMAI_ASSETS_ROOT())
    + measureDirectoryBytesStrict(PHIGROS_FONT_ROOT())
    + measureDirectoryBytesStrict(PHIGROS_ILLUSTRATION_ROOT())
    + measureDirectoryBytesStrict(OSU_MOD_ICONS_ROOT());
}
