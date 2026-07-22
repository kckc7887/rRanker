import type { GameId } from '@/domain/game-bind-options';
import { findGame } from '@/domain/game-bind-options';
import { clearPhigrosIllustrationStage, phigrosIllustrationStageDirectory } from '@/features/phigros-best-image/load-phigros-image-assets';
import { clearPhigrosFontCache } from '@/features/phigros-best-image/phigros-font-cache';
import { isDurableMaimaiAccountId } from '@/features/storage-management/durable-maimai-account';
import type { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';
import {
  clearDirectoryContents,
  measureDirectoryBytes,
  APP_CACHE_ROOT,
  PHIGROS_FONT_ROOT,
} from '@/features/storage-management/fs-storage';

export { isDurableMaimaiAccountId } from '@/features/storage-management/durable-maimai-account';

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

function accountIdFromResourceKey(key: string): string | null {
  if (key.startsWith('score:')) return key.slice('score:'.length);
  if (key.startsWith('account-avatar:')) return key.slice('account-avatar:'.length);
  return null;
}

function resourceBelongsToGame(key: string, gameId: GameId): boolean {
  if (gameId === 'maimai' && (MAIMAI_CATALOG_RESOURCE_KEYS as readonly string[]).includes(key)) {
    return true;
  }
  const accountId = accountIdFromResourceKey(key);
  if (accountId) return accountIdBelongsToGame(accountId, gameId);
  return false;
}

/** 舞萌可清缓存：排除本地账号成绩/头像资源。 */
function isClearableMaimaiAccountData(accountId: string): boolean {
  return accountIdBelongsToGame(accountId, 'maimai') && !isDurableMaimaiAccountId(accountId);
}

function isClearableMaimaiResource(key: string): boolean {
  if ((MAIMAI_CATALOG_RESOURCE_KEYS as readonly string[]).includes(key)) return true;
  const accountId = accountIdFromResourceKey(key);
  if (!accountId) return false;
  return isClearableMaimaiAccountData(accountId);
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
    if (gameId === 'maimai') {
      if (isClearableMaimaiAccountData(row.accountId)) total += row.bytes;
      continue;
    }
    if (accountIdBelongsToGame(row.accountId, gameId)) total += row.bytes;
  }
  for (const row of resources) {
    if (gameId === 'maimai') {
      if (isClearableMaimaiResource(row.key)) total += row.bytes;
      continue;
    }
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
    .filter((id) => (
      gameId === 'maimai'
        ? isClearableMaimaiAccountData(id)
        : accountIdBelongsToGame(id, gameId)
    ));
  const resourceKeys = resources
    .map((row) => row.key)
    .filter((key) => (
      gameId === 'maimai'
        ? isClearableMaimaiResource(key)
        : resourceBelongsToGame(key, gameId)
    ));
  // Phigros 等不落盘成绩时，头像等资源只有 resource 行，必须按键直接删，不能依赖成绩行顺带清理。
  await snapshots.clearAccountScores(accountIds);
  await snapshots.clearResources(resourceKeys);
  if (includeCatalog) await snapshots.clearCatalog();
}

/** 本地舞萌账号成绩快照计入个人数据（不可清除）。 */
export async function measureDurableLocalMaimaiBytes(
  snapshots: SqliteSnapshotRepository,
): Promise<number> {
  const [scores, resources] = await Promise.all([
    snapshots.listAccountScoreSizes(),
    snapshots.listResourceSizes(),
  ]);
  let total = 0;
  for (const row of scores) {
    if (isDurableMaimaiAccountId(row.accountId)) total += row.bytes;
  }
  for (const row of resources) {
    const accountId = accountIdFromResourceKey(row.key);
    if (accountId && isDurableMaimaiAccountId(accountId)) total += row.bytes;
  }
  return total;
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
    return sqlite
      + measureDirectoryBytes(PHIGROS_FONT_ROOT())
      + measureDirectoryBytes(phigrosIllustrationStageDirectory());
  },
  async clear(snapshots) {
    await clearGameSqlite(snapshots, 'phigros', false);
    clearPhigrosFontCache();
    clearPhigrosIllustrationStage();
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
