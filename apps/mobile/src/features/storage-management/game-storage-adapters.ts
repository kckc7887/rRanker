import { phigrosResources } from '@/services/phigros-resources';
import { rizlineResources } from '@/services/rizline-resources';
import type { GameId } from '@/domain/game-bind-options';
import { findGame } from '@/domain/game-bind-options';
import { DXRATING_CHART_TAGS_RESOURCE_KEY } from '@/domain/dxrating-chart-tags';
import {
  PHIGROS_KYOU_RESOURCE_KEYS,
} from '@/domain/phigros-kyou';
import {
  CHUNITHM_ALIAS_RESOURCE_KEY,
  CHUNITHM_CATALOG_RESOURCE_KEY,
  CHUNITHM_SONG_DETAIL_RESOURCE_PREFIX,
} from '@/domain/chunithm';
import { CHUNITHM_COLLECTION_LIST_RESOURCE_KEY } from '@/domain/chunithm-collections';
import { clearPhigrosIllustrationStage, phigrosIllustrationStageDirectory } from '@/features/phigros-best-image/load-phigros-image-assets';
import { clearPhigrosFontCache } from '@/features/phigros-best-image/phigros-font-cache';
import { clearMaimaiUiCache } from '@/features/best-image/maimai-ui-cache';
import { isDurableMaimaiAccountId } from '@/features/storage-management/durable-maimai-account';
import type { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';
import { MAIMAI_ASSETS_ROOT, PHIGROS_FONT_ROOT } from '@/features/storage-management/fs-storage';
import { resetPhigrosKyouAliasesCache } from '@/services/phigros-kyou-cache';
import {
  collectStorageMeasurementInventory,
  createGameStorageAdapter,
  selectStorageInventory,
  type GameStorageAdapter,
  type StorageMeasurementInventory,
} from '@/features/storage-management/storage-adapter-core';

export { collectStorageMeasurementInventory } from '@/features/storage-management/storage-adapter-core';
export type { GameStorageAdapter, StorageMeasurementInventory } from '@/features/storage-management/storage-adapter-core';
export { clearSharedCache, measureSharedCacheBytes, sharedCacheNote } from '@/features/storage-management/shared-storage-cache';

export { isDurableMaimaiAccountId } from '@/features/storage-management/durable-maimai-account';

export const MAIMAI_CATALOG_RESOURCE_KEYS = [
  'detailed-catalog',
  'aliases',
  'plates',
  'collections',
  DXRATING_CHART_TAGS_RESOURCE_KEY,
] as const;
export const CHUNITHM_CATALOG_RESOURCE_KEYS = [
  CHUNITHM_CATALOG_RESOURCE_KEY,
  CHUNITHM_ALIAS_RESOURCE_KEY,
] as const;
export const PHIGROS_RESOURCE_KEYS = [
  ...PHIGROS_KYOU_RESOURCE_KEYS,
] as const;

export type StorageSegmentId = 'app' | 'shared' | GameId;

function accountOwnership(gameId: GameId, exclude?: (accountId: string) => boolean) {
  return (accountId: string) => (accountId === gameId || accountId.startsWith(`${gameId}:`)) && !exclude?.(accountId);
}

export async function measureDurableLocalMaimaiBytes(
  snapshots: SqliteSnapshotRepository,
  inventory?: StorageMeasurementInventory,
): Promise<number> {
  const measured = inventory ?? await collectStorageMeasurementInventory(snapshots, false);
  return selectStorageInventory(measured, { ownsAccount: isDurableMaimaiAccountId }).bytes;
}

const maimaiFileResources: GameStorageAdapter['fileResources'] = [{
  persistence: 'versioned-asset', root: MAIMAI_ASSETS_ROOT, clear: clearMaimaiUiCache,
}];
const maimaiAdapter = createGameStorageAdapter({
  gameId: 'maimai',
  title: findGame('maimai')?.title ?? '舞萌 DX',
  color: '#F43F5E',
  note: '账号成绩快照与当前版本导出素材；SQLite 为估算值',
  queryKeys: [
    ['score-snapshot'], ['game-data'], ['songs'], ['detailed-catalog'], ['plates'],
    ['collections'], ['dxrating-chart-tags'], ['best-image-collections'],
  ],
  fileResources: maimaiFileResources,
  ownership: {
    ownsAccount: accountOwnership('maimai', isDurableMaimaiAccountId),
    resourceKeys: MAIMAI_CATALOG_RESOURCE_KEYS,
    includeCatalog: true,
  },
});

const phigrosFileResources: GameStorageAdapter['fileResources'] = [
  { persistence: 'versioned-asset', root: PHIGROS_FONT_ROOT, clear: clearPhigrosFontCache },
  { persistence: 'temporary', root: phigrosIllustrationStageDirectory, clear: clearPhigrosIllustrationStage },
];
const phigrosAdapter = createGameStorageAdapter({
  gameId: 'phigros',
  title: findGame('phigros')?.title ?? 'Phigros',
  color: '#8B5CF6',
  note: '账号存档与当前版本字体；SQLite 为估算值',
  queryKeys: [['score-snapshot'], ['game-data'], ['phigros-catalog'], ['phigros-kyou-chart-tags']],
  resetMemory: () => { resetPhigrosKyouAliasesCache(); phigrosResources.clear(); },
  fileResources: phigrosFileResources,
  ownership: { ownsAccount: accountOwnership('phigros'), resourceKeys: PHIGROS_RESOURCE_KEYS },
});

const chunithmAdapter = createGameStorageAdapter({
  gameId: 'chunithm',
  title: findGame('chunithm')?.title ?? '中二节奏',
  color: '#27A7E7',
  note: '账号成绩快照；公开曲库仅保留在会话内，SQLite 为估算值',
  queryKeys: [['score-snapshot'], ['game-data'], ['chunithm-catalog'], ['chunithm-song-detail'], ['chunithm-collections']],
  fileResources: [],
  ownership: { ownsAccount: accountOwnership('chunithm'), resourceKeys: CHUNITHM_CATALOG_RESOURCE_KEYS, resourcePrefixes: [CHUNITHM_SONG_DETAIL_RESOURCE_PREFIX, `${CHUNITHM_COLLECTION_LIST_RESOURCE_KEY}:`] },
});

const adofaiAdapter = createGameStorageAdapter({
  gameId: 'adofai',
  title: findGame('adofai')?.title ?? '冰与火之舞',
  color: '#F15B55',
  note: '玩家资料与核心成绩快照；公开结果仅保留在会话内，SQLite 为估算值',
  queryKeys: [['tuf'], ['game-data']],
  fileResources: [],
  ownership: { ownsAccount: accountOwnership('adofai'), resourcePrefixes: ['tuf:'] },
});

const musedashAdapter = createGameStorageAdapter({
  gameId: 'musedash',
  title: findGame('musedash')?.title ?? '喵斯快跑',
  color: '#EC4899',
  note: '玩家与核心成绩快照；曲库及单曲明细仅保留在会话内，SQLite 为估算值',
  queryKeys: [['musedash'], ['game-data']],
  fileResources: [],
  ownership: { ownsAccount: accountOwnership('musedash'), resourcePrefixes: ['musedash:'] },
});

const majdataAdapter = createGameStorageAdapter({
  gameId: 'majdata-net', title: 'Majdata Net', color: '#2563EB', note: '玩家成绩、歌曲和谱面缓存',
  queryKeys: [['majdata-net'], ['game-data']], fileResources: [],
  ownership: { ownsAccount: accountOwnership('majdata-net'), resourcePrefixes: ['majdata-net:'] },
});

const phiraAdapter = createGameStorageAdapter({
  gameId: 'phira',
  title: findGame('phira')?.title ?? 'Phira',
  color: '#8D5BD6',
  note: '玩家与核心成绩快照；曲库、谱面及物量仅保留在会话内，SQLite 为估算值',
  queryKeys: [['phira'], ['game-data']],
  fileResources: [],
  ownership: { ownsAccount: accountOwnership('phira'), resourcePrefixes: ['phira:'] },
});

/** osu! 四模式：后台各注册为独立游戏，按模式统计/清除各自的快照缓存。 */
const OSU_STORAGE_COLOR = '#FF66AA';
const OSU_STORAGE_NOTE = '玩家资料、Top 100 与已知成绩快照；SQLite 为估算值';

const osuStandardAdapter = createGameStorageAdapter({
  gameId: 'osu-standard',
  title: findGame('osu-standard')?.title ?? 'osu!standard',
  color: OSU_STORAGE_COLOR,
  note: OSU_STORAGE_NOTE,
  queryKeys: [['score-snapshot'], ['game-data'], ['osu-catalog-search'], ['osu-beatmapset-detail'], ['osu-known-scores']],
  fileResources: [],
  ownership: { ownsAccount: accountOwnership('osu-standard'), resourcePrefixes: ['osu:osu-standard:', 'osu-known-scores:osu-standard:'] },
});

const osuManiaAdapter = createGameStorageAdapter({
  gameId: 'osu-mania',
  title: findGame('osu-mania')?.title ?? 'osu!mania',
  color: OSU_STORAGE_COLOR,
  note: OSU_STORAGE_NOTE,
  queryKeys: [['score-snapshot'], ['game-data'], ['osu-catalog-search'], ['osu-beatmapset-detail'], ['osu-known-scores']],
  fileResources: [],
  ownership: { ownsAccount: accountOwnership('osu-mania'), resourcePrefixes: ['osu:osu-mania:', 'osu-known-scores:osu-mania:'] },
});

const osuCatchAdapter = createGameStorageAdapter({
  gameId: 'osu-catch',
  title: findGame('osu-catch')?.title ?? 'osu!catch',
  color: OSU_STORAGE_COLOR,
  note: OSU_STORAGE_NOTE,
  queryKeys: [['score-snapshot'], ['game-data'], ['osu-catalog-search'], ['osu-beatmapset-detail'], ['osu-known-scores']],
  fileResources: [],
  ownership: { ownsAccount: accountOwnership('osu-catch'), resourcePrefixes: ['osu:osu-catch:', 'osu-known-scores:osu-catch:'] },
});

const osuTaikoAdapter = createGameStorageAdapter({
  gameId: 'osu-taiko',
  title: findGame('osu-taiko')?.title ?? 'osu!taiko',
  color: OSU_STORAGE_COLOR,
  note: OSU_STORAGE_NOTE,
  queryKeys: [['score-snapshot'], ['game-data'], ['osu-catalog-search'], ['osu-beatmapset-detail'], ['osu-known-scores']],
  fileResources: [],
  ownership: { ownsAccount: accountOwnership('osu-taiko'), resourcePrefixes: ['osu:osu-taiko:', 'osu-known-scores:osu-taiko:'] },
});

export const GAME_STORAGE_ADAPTERS: readonly GameStorageAdapter[] = [
  maimaiAdapter,
  chunithmAdapter,
  phigrosAdapter,
  adofaiAdapter,
  musedashAdapter,
  phiraAdapter,
  majdataAdapter,
  osuStandardAdapter,
  osuManiaAdapter,
  osuCatchAdapter,
  osuTaikoAdapter,
  createGameStorageAdapter({ gameId: 'rizline', title: 'Rizline', color: '#57E4C4', note: '账号成绩快照与已验证曲库',
    queryKeys: [['rizline'], ['game-data']], fileResources: [], resetMemory: () => rizlineResources.clear(),
    ownership: { ownsAccount: accountOwnership('rizline'), resourcePrefixes: ['rizline:'] } }),
];

export function getGameStorageAdapter(gameId: GameId): GameStorageAdapter | undefined {
  return GAME_STORAGE_ADAPTERS.find((adapter) => adapter.gameId === gameId);
}
