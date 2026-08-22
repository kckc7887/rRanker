import type { GameId } from '@/domain/game-bind-options';
import type { StorageClearCategoryId } from '@/storage/storage-clear-prefs-store';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';
import { SqliteUserLibraryRepository } from '@/storage/sqlite-user-library-repository';
import { measureRrankerDatabaseAllocation } from '@/storage/rranker-database';
import {
  GAME_STORAGE_ADAPTERS,
  measureDurableLocalMaimaiBytes,
  measureSharedCacheBytes,
  sharedCacheNote,
  type StorageSegmentId,
} from '@/features/storage-management/game-storage-adapters';
import {
  APP_CACHE_ROOT,
  MAIMAI_ASSETS_ROOT,
  OSU_MOD_ICONS_ROOT,
  PHIGROS_FONT_ROOT,
  PHIGROS_ILLUSTRATION_ROOT,
  measureDirectoryBytesStrict,
} from '@/features/storage-management/fs-storage';
import { isManagedClearableCacheEntry } from '@/features/storage-management/expo-system-cache';

export type StorageUsageSegment = {
  id: StorageSegmentId;
  title: string;
  bytes: number;
  precision: 'exact' | 'estimated';
  clearable: boolean;
  /** 勾选清除用的 id；个人数据不可清除时为 null */
  clearCategoryId: StorageClearCategoryId | null;
  note?: string;
  color: string;
};

export type StorageUsageReport = {
  segments: StorageUsageSegment[];
  totalBytes: number;
  clearableBytes: number;
  precision: 'estimated';
  sqliteAllocatedBytes: number;
  sqliteReclaimableBytes: number;
};

const SEGMENT_COLORS: Record<string, string> = {
  app: '#94A3B8',
  shared: '#0EA5E9',
  test: '#64748B',
};

const snapshots = new SqliteSnapshotRepository();
const library = new SqliteUserLibraryRepository();

export function listClearableCategoryIds(): StorageClearCategoryId[] {
  return [
    ...GAME_STORAGE_ADAPTERS.map((adapter) => adapter.gameId),
    'shared',
  ];
}

export async function collectStorageUsage(): Promise<StorageUsageReport> {
  const [libraryBytes, localMaimaiBytes, sharedBytes, sqliteAllocation, ...gameBytes] = await Promise.all([
    library.measureBytes(),
    measureDurableLocalMaimaiBytes(snapshots),
    measureSharedCacheBytes(),
    measureRrankerDatabaseAllocation(),
    ...GAME_STORAGE_ADAPTERS.map((adapter) => adapter.measure(snapshots)),
  ]);
  const appBytes = libraryBytes + localMaimaiBytes;
  const sqliteReclaimableBytes = Math.max(
    0,
    sqliteAllocation.allocatedBytes - sqliteAllocation.liveBytesEstimate,
  );

  const segments: StorageUsageSegment[] = [
    {
      id: 'app',
      title: '个人数据',
      bytes: appBytes,
      precision: 'estimated',
      clearable: false,
      clearCategoryId: null,
      note: '用户收藏、本地账号成绩与头像等；不含安装包与游戏缓存',
      color: SEGMENT_COLORS.app,
    },
    ...GAME_STORAGE_ADAPTERS.map((adapter, index) => ({
      id: adapter.gameId as StorageSegmentId,
      title: adapter.title,
      bytes: gameBytes[index] ?? 0,
      precision: 'estimated' as const,
      clearable: true,
      clearCategoryId: adapter.gameId as GameId,
      color: adapter.color,
      note: adapter.note,
    })),
    {
      id: 'shared',
      title: '共享缓存',
      bytes: sharedBytes + sqliteReclaimableBytes,
      precision: 'estimated',
      clearable: true,
      clearCategoryId: 'shared',
      note: `${sharedCacheNote()}；含 SQLite 可回收空闲页估算`,
      color: SEGMENT_COLORS.shared,
    },
  ];

  const totalBytes = segments.reduce((sum, segment) => sum + segment.bytes, 0);
  const clearableBytes = segments.reduce(
    (sum, segment) => sum + (segment.clearable ? segment.bytes : 0),
    0,
  );
  return {
    segments,
    totalBytes,
    clearableBytes,
    precision: 'estimated',
    sqliteAllocatedBytes: sqliteAllocation.allocatedBytes,
    sqliteReclaimableBytes,
  };
}

/** 清理前后使用同一物理口径：SQLite 分配页 + 受管文件目录。 */
export async function measureManagedStorageBytes(): Promise<number> {
  const sqlite = await measureRrankerDatabaseAllocation();
  return sqlite.allocatedBytes
    + measureDirectoryBytesStrict(APP_CACHE_ROOT(), { skip: (name) => !isManagedClearableCacheEntry(name) })
    + measureDirectoryBytesStrict(MAIMAI_ASSETS_ROOT())
    + measureDirectoryBytesStrict(PHIGROS_FONT_ROOT())
    + measureDirectoryBytesStrict(PHIGROS_ILLUSTRATION_ROOT())
    + measureDirectoryBytesStrict(OSU_MOD_ICONS_ROOT());
}
