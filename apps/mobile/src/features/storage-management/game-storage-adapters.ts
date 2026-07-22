import type { GameId } from '@/domain/game-bind-options';
import { findGame } from '@/domain/game-bind-options';
import { clearPhigrosFontCache } from '@/features/phigros-best-image/phigros-font-cache';
import type { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';
import {
  clearDirectoryContents,
  measureDirectoryBytes,
  APP_CACHE_ROOT,
  PHIGROS_FONT_ROOT,
} from '@/features/storage-management/fs-storage';

export const MAIMAI_CATALOG_RESOURCE_KEYS = [
  'detailed-catalog',
  'aliases',
  'plates',
  'collections',
] as const;

export type StorageSegmentId = 'app' | 'shared' | GameId;

export type GameStorageAdapter = {
  gameId: GameId;
  title: string;
  measure: (snapshots: SqliteSnapshotRepository) => Promise<number>;
  clear: (snapshots: SqliteSnapshotRepository) => Promise<void>;
};

function accountIdBelongsToGame(accountId: string, gameId: GameId): boolean {
  return accountId === gameId || accountId.startsWith(`${gameId}:`);
}

function resourceBelongsToGame(key: string, gameId: GameId): boolean {
  if (gameId === 'maimai' && (MAIMAI_CATALOG_RESOURCE_KEYS as readonly string[]).includes(key)) {
    return true;
  }
  if (key.startsWith('score:')) {
    return accountIdBelongsToGame(key.slice('score:'.length), gameId);
  }
  if (key.startsWith('account-avatar:')) {
    return accountIdBelongsToGame(key.slice('account-avatar:'.length), gameId);
  }
  return false;
}

async function measureGameSqliteBytes(
  snapshots: SqliteSnapshotRepository,
  gameId: GameId,
  includeCatalog: boolean,
): Promise<number> {
  const [scores, resources, catalog, legacy] = await Promise.all([
    snapshots.listAccountScoreSizes(),
    snapshots.listResourceSizes(),
    includeCatalog ? snapshots.measureCatalogBytes() : Promise.resolve(0),
    includeCatalog ? snapshots.measureLegacyScoreBytes() : Promise.resolve(0),
  ]);
  let total = 0;
  for (const row of scores) {
    if (accountIdBelongsToGame(row.accountId, gameId)) total += row.bytes;
  }
  for (const row of resources) {
    if (resourceBelongsToGame(row.key, gameId)) total += row.bytes;
  }
  return total + catalog + legacy;
}

async function clearGameSqlite(
  snapshots: SqliteSnapshotRepository,
  gameId: GameId,
  includeCatalog: boolean,
): Promise<void> {
  const [scores, resources] = await Promise.all([
    snapshots.listAccountScoreSizes(),
    snapshots.listResourceSizes(),
  ]);
  const accountIds = scores
    .map((row) => row.accountId)
    .filter((id) => accountIdBelongsToGame(id, gameId));
  const resourceKeys = resources
    .map((row) => row.key)
    .filter((key) => resourceBelongsToGame(key, gameId));
  // 成绩行会顺带删 score:/avatar: 资源；其余目录类资源单独删
  await snapshots.clearAccountScores(accountIds);
  const leftover = resourceKeys.filter(
    (key) => !key.startsWith('score:') && !key.startsWith('account-avatar:'),
  );
  await snapshots.clearResources(leftover);
  if (includeCatalog) await snapshots.clearCatalog();
}

const maimaiAdapter: GameStorageAdapter = {
  gameId: 'maimai',
  title: findGame('maimai')?.title ?? '舞萌 DX',
  measure: (snapshots) => measureGameSqliteBytes(snapshots, 'maimai', true),
  clear: (snapshots) => clearGameSqlite(snapshots, 'maimai', true),
};

const phigrosAdapter: GameStorageAdapter = {
  gameId: 'phigros',
  title: findGame('phigros')?.title ?? 'Phigros',
  async measure(snapshots) {
    const sqlite = await measureGameSqliteBytes(snapshots, 'phigros', false);
    return sqlite + measureDirectoryBytes(PHIGROS_FONT_ROOT());
  },
  async clear(snapshots) {
    await clearGameSqlite(snapshots, 'phigros', false);
    clearPhigrosFontCache();
  },
};

/** 新游戏接入：在此注册 measure/clear 即可出现在环形图与勾选列表。 */
export const GAME_STORAGE_ADAPTERS: readonly GameStorageAdapter[] = [
  maimaiAdapter,
  phigrosAdapter,
];

export function getGameStorageAdapter(gameId: GameId): GameStorageAdapter | undefined {
  return GAME_STORAGE_ADAPTERS.find((adapter) => adapter.gameId === gameId);
}

export async function measureSharedCacheBytes(): Promise<number> {
  return measureDirectoryBytes(APP_CACHE_ROOT());
}

export async function clearSharedCache(): Promise<{ imageCacheCleared: boolean }> {
  clearDirectoryContents(APP_CACHE_ROOT());
  let imageCacheCleared = false;
  try {
    const { Image } = await import('expo-image');
    const [disk, memory] = await Promise.all([
      Image.clearDiskCache(),
      Image.clearMemoryCache(),
    ]);
    imageCacheCleared = disk === true || memory === true;
  } catch {
    imageCacheCleared = false;
  }
  return { imageCacheCleared };
}

export function sharedCacheNote(): string {
  return '含图片缓存（体积未计入）';
}
