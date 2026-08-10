import type { GameId } from '@/domain/game-bind-options';
import type { StorageClearCategoryId } from '@/storage/storage-clear-prefs-store';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';
import { SqliteUserLibraryRepository } from '@/storage/sqlite-user-library-repository';
import {
  GAME_STORAGE_ADAPTERS,
  measureDurableLocalMaimaiBytes,
  measureSharedCacheBytes,
  sharedCacheNote,
  type StorageSegmentId,
} from '@/features/storage-management/game-storage-adapters';

export type StorageUsageSegment = {
  id: StorageSegmentId;
  title: string;
  bytes: number;
  clearable: boolean;
  /** 勾选清除用的 id；个人数据不可清除时为 null */
  clearCategoryId: StorageClearCategoryId | null;
  note?: string;
  color: string;
};

export type StorageUsageReport = {
  segments: StorageUsageSegment[];
  totalBytes: number;
};

const SEGMENT_COLORS: Record<string, string> = {
  app: '#94A3B8',
  maimai: '#F43F5E',
  chunithm: '#27A7E7',
  phigros: '#8B5CF6',
  adofai: '#F15B55',
  musedash: '#EC4899',
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
  const [libraryBytes, localMaimaiBytes, sharedBytes, ...gameBytes] = await Promise.all([
    library.measureBytes(),
    measureDurableLocalMaimaiBytes(snapshots),
    measureSharedCacheBytes(),
    ...GAME_STORAGE_ADAPTERS.map((adapter) => adapter.measure(snapshots)),
  ]);
  const appBytes = libraryBytes + localMaimaiBytes;

  const segments: StorageUsageSegment[] = [
    {
      id: 'app',
      title: '个人数据',
      bytes: appBytes,
      clearable: false,
      clearCategoryId: null,
      note: '用户收藏、本地账号成绩与头像等；不含安装包与游戏缓存',
      color: SEGMENT_COLORS.app,
    },
    ...GAME_STORAGE_ADAPTERS.map((adapter, index) => ({
      id: adapter.gameId as StorageSegmentId,
      title: adapter.title,
      bytes: gameBytes[index] ?? 0,
      clearable: true,
      clearCategoryId: adapter.gameId as GameId,
      color: SEGMENT_COLORS[adapter.gameId] ?? '#6366F1',
      ...(adapter.gameId === 'maimai'
        ? { note: '成绩与曲库缓存；不含本地账号成绩' }
        : adapter.gameId === 'chunithm'
          ? { note: '成绩与曲库缓存' }
          : adapter.gameId === 'phigros'
            ? { note: '存档、曲库与图片缓存' }
            : adapter.gameId === 'adofai'
              ? { note: '玩家资料、成绩与曲库缓存' }
              : adapter.gameId === 'musedash'
                ? { note: '曲库、定数表、名称表与玩家成绩缓存' }
                : {}),
    })),
    {
      id: 'shared',
      title: '共享缓存',
      bytes: sharedBytes,
      clearable: true,
      clearCategoryId: 'shared',
      note: sharedCacheNote(),
      color: SEGMENT_COLORS.shared,
    },
  ];

  const totalBytes = segments.reduce((sum, segment) => sum + segment.bytes, 0);
  return { segments, totalBytes };
}
