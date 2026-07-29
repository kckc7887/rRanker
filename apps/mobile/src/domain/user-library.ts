import { z } from 'zod';
import { normalizeSongId } from './catalog';
import type { GameId } from './game-bind-options';
import type { ChartType } from './models';
import { canonicalChartId } from './game-model';

export const USER_DATA_BACKUP_FORMAT = 'rranker-user-data' as const;
export const USER_DATA_BACKUP_VERSION = 4 as const;
export const DEFAULT_TAG_PRESETS = ['爆发', '交互', '星星', '鬼歌', '大歌'] as const;
export const MAX_TAG_LENGTH = 24;
export const MAX_TAGS_PER_ITEM = 30;
export const MAX_BACKUP_ITEMS = 5000;

const KNOWN_GAME_IDS = new Set<GameId>(['maimai', 'chunithm', 'phigros', 'test']);
const GameIdSchema = z.enum(['maimai', 'chunithm', 'phigros', 'test']);

export interface SongLibraryTarget {
  kind: 'song';
  gameId: GameId;
  songId: string;
}

export interface ChartLibraryTarget {
  kind: 'chart';
  gameId: GameId;
  songId: string;
  /** 规范化后必有；可选仅用于读取 v1-v3 与迁移中的旧调用。 */
  chartId?: string;
  /** v1-v3 备份及旧谱面路由的兼容元数据；新游戏不得依赖这两个字段作为身份。 */
  type?: ChartType;
  levelIndex?: number;
}

export type LibraryTarget = SongLibraryTarget | ChartLibraryTarget;

interface LibraryItemBase {
  key: string;
  gameId: GameId;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface SongLibraryItem extends LibraryItemBase {
  kind: 'song';
  songId: string;
  favorite: boolean;
}

export interface ChartLibraryItem extends LibraryItemBase {
  kind: 'chart';
  songId: string;
  chartId?: string;
  type?: ChartType;
  levelIndex?: number;
  practice: boolean;
}

export type UserLibraryItem = SongLibraryItem | ChartLibraryItem;
export type RestoreMode = 'merge' | 'replace';

export interface UserDataBackupV1 {
  format: typeof USER_DATA_BACKUP_FORMAT;
  version: 1;
  exportedAt: string;
  items: UserLibraryItem[];
}

export interface UserDataBackupV2 {
  format: typeof USER_DATA_BACKUP_FORMAT;
  version: 2;
  exportedAt: string;
  items: UserLibraryItem[];
  tagPresets: string[];
}

export interface UserDataBackupV3 {
  format: typeof USER_DATA_BACKUP_FORMAT;
  version: 3;
  exportedAt: string;
  items: UserLibraryItem[];
  tagPresets: string[];
}

export interface UserDataBackupV4 {
  format: typeof USER_DATA_BACKUP_FORMAT;
  version: typeof USER_DATA_BACKUP_VERSION;
  exportedAt: string;
  items: UserLibraryItem[];
  tagPresets: string[];
}

export type UserDataBackup = UserDataBackupV1 | UserDataBackupV2 | UserDataBackupV3 | UserDataBackupV4;

const TimestampSchema = z.string().datetime();
const SongIdSchema = z.string().trim().min(1).max(64);
const TagSchema = z.string().min(1).max(128);
const CommonItemShape = {
  key: z.string().min(1).max(160),
  gameId: GameIdSchema.optional(),
  songId: SongIdSchema,
  tags: z.array(TagSchema).max(MAX_TAGS_PER_ITEM),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
};

const SongItemSchema = z.object({
  ...CommonItemShape,
  kind: z.literal('song'),
  favorite: z.boolean(),
}).strict();

const LegacyChartItemSchema = z.object({
  ...CommonItemShape,
  kind: z.literal('chart'),
  type: z.enum(['SD', 'DX', 'UTAGE']),
  levelIndex: z.number().int().min(0).max(255),
  practice: z.boolean(),
}).strict();

const ChartItemSchema = z.object({
  ...CommonItemShape,
  kind: z.literal('chart'),
  chartId: z.string().trim().min(1).max(512),
  type: z.enum(['SD', 'DX', 'UTAGE']).optional(),
  levelIndex: z.number().int().min(0).max(255).optional(),
  practice: z.boolean(),
}).strict().superRefine((item, context) => {
  if ((item.type === undefined) !== (item.levelIndex === undefined)) {
    context.addIssue({
      code: 'custom',
      message: '兼容 type 与 levelIndex 必须同时存在或同时省略',
      path: ['type'],
    });
  }
});

const UserDataBackupV1Schema = z.object({
  format: z.literal(USER_DATA_BACKUP_FORMAT),
  version: z.literal(1),
  exportedAt: TimestampSchema,
  items: z.array(z.discriminatedUnion('kind', [SongItemSchema, LegacyChartItemSchema])).max(MAX_BACKUP_ITEMS),
}).strict();
const UserDataBackupV2Schema = z.object({
  format: z.literal(USER_DATA_BACKUP_FORMAT),
  version: z.literal(2),
  exportedAt: TimestampSchema,
  items: z.array(z.discriminatedUnion('kind', [SongItemSchema, LegacyChartItemSchema])).max(MAX_BACKUP_ITEMS),
  tagPresets: z.array(TagSchema).max(200),
}).strict();
const UserDataBackupV3Schema = z.object({
  format: z.literal(USER_DATA_BACKUP_FORMAT),
  version: z.literal(3),
  exportedAt: TimestampSchema,
  items: z.array(z.discriminatedUnion('kind', [SongItemSchema, LegacyChartItemSchema])).max(MAX_BACKUP_ITEMS),
  tagPresets: z.array(TagSchema).max(200),
}).strict();
const UserDataBackupV4Schema = z.object({
  format: z.literal(USER_DATA_BACKUP_FORMAT),
  version: z.literal(USER_DATA_BACKUP_VERSION),
  exportedAt: TimestampSchema,
  items: z.array(z.discriminatedUnion('kind', [SongItemSchema, ChartItemSchema])).max(MAX_BACKUP_ITEMS),
  tagPresets: z.array(TagSchema).max(200),
}).strict();
const UserDataBackupSchema = z.discriminatedUnion('version', [
  UserDataBackupV1Schema,
  UserDataBackupV2Schema,
  UserDataBackupV3Schema,
  UserDataBackupV4Schema,
]);

export function inferGameIdFromKey(key: string): GameId {
  const [prefix, gameOrSongId] = key.split(':');
  if ((prefix === 'song' || prefix === 'chart') && gameOrSongId && KNOWN_GAME_IDS.has(gameOrSongId as GameId)) {
    return gameOrSongId as GameId;
  }
  return 'maimai';
}

export function songLibraryKey(gameId: GameId, songId: string | number): string {
  return `song:${gameId}:${normalizeSongId(songId)}`;
}

export function chartLibraryKey(gameId: GameId, songId: string | number, chartId: string): string;
export function chartLibraryKey(
  gameId: GameId,
  songId: string | number,
  type: ChartType,
  levelIndex: number,
): string;
export function chartLibraryKey(
  gameId: GameId,
  songId: string | number,
  chartIdOrType: string,
  levelIndex?: number,
): string {
  const chartId = levelIndex === undefined
    ? chartIdOrType
    : canonicalChartId(gameId, normalizeSongId(songId), chartIdOrType, levelIndex);
  return `chart:${gameId}:${encodeURIComponent(chartId)}`;
}

export function libraryTargetKey(target: LibraryTarget): string {
  return target.kind === 'song'
    ? songLibraryKey(target.gameId, target.songId)
    : target.chartId
      ? chartLibraryKey(target.gameId, target.songId, target.chartId)
      : chartLibraryKey(target.gameId, target.songId, target.type ?? 'SD', target.levelIndex ?? 0);
}

export function normalizeTagName(value: string): { displayName: string; key: string } {
  const displayName = value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
  if (!displayName) throw new Error('标签不能为空');
  if (Array.from(displayName).length > MAX_TAG_LENGTH) throw new Error(`标签不能超过 ${MAX_TAG_LENGTH} 个字符`);
  return { displayName, key: displayName.toLowerCase() };
}

export function normalizeTags(values: readonly string[]): string[] {
  const byKey = new Map<string, string>();
  for (const value of values) {
    const normalized = normalizeTagName(value);
    if (!byKey.has(normalized.key)) byKey.set(normalized.key, normalized.displayName);
  }
  if (byKey.size > MAX_TAGS_PER_ITEM) throw new Error(`每个项目最多添加 ${MAX_TAGS_PER_ITEM} 个标签`);
  return [...byKey.values()];
}

export function buildTagHistory(
  items: readonly UserLibraryItem[],
  currentKey: string,
  presets: readonly string[],
): string[] {
  const excluded = new Set(presets.map((value) => normalizeTagName(value).key));
  const latest = new Map<string, { displayName: string; updatedAt: string }>();
  for (const item of items) {
    if (item.key === currentKey) continue;
    for (const tag of item.tags) {
      const normalized = normalizeTagName(tag);
      if (excluded.has(normalized.key)) continue;
      const previous = latest.get(normalized.key);
      if (!previous || item.updatedAt > previous.updatedAt) {
        latest.set(normalized.key, { displayName: normalized.displayName, updatedAt: item.updatedAt });
      }
    }
  }
  return [...latest.values()].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)
    || left.displayName.localeCompare(right.displayName)).map((item) => item.displayName);
}

export function normalizeLibraryItem(item: UserLibraryItem): UserLibraryItem {
  const gameId = item.gameId ?? inferGameIdFromKey(item.key);
  const songId = normalizeSongId(item.songId);
  const tags = normalizeTags(item.tags);
  if (item.kind === 'song') {
    return { ...item, gameId, key: songLibraryKey(gameId, songId), songId, tags };
  }
  const legacyLevelIndex = item.levelIndex;
  const legacyType = item.type;
  if ((legacyType === undefined) !== (legacyLevelIndex === undefined)) {
    throw new Error('旧谱面类型与难度序号必须同时存在');
  }
  if (legacyLevelIndex !== undefined
    && (!Number.isInteger(legacyLevelIndex) || legacyLevelIndex < 0 || legacyLevelIndex > 255)) {
    throw new Error('谱面难度序号无效');
  }
  const chartId = item.chartId || (legacyType !== undefined && legacyLevelIndex !== undefined
    ? canonicalChartId(gameId, songId, legacyType, legacyLevelIndex)
    : '');
  if (!chartId) throw new Error('谱面 chartId 不能为空');
  return {
    ...item,
    gameId,
    key: chartLibraryKey(gameId, songId, chartId),
    songId,
    chartId,
    tags,
  };
}

export function shouldKeepLibraryItem(item: UserLibraryItem): boolean {
  return item.tags.length > 0 || (item.kind === 'song' ? item.favorite : item.practice);
}

export function createUserDataBackup(
  items: readonly UserLibraryItem[],
  exportedAt = new Date().toISOString(),
  tagPresets: readonly string[] = DEFAULT_TAG_PRESETS,
): UserDataBackupV4 {
  return {
    format: USER_DATA_BACKUP_FORMAT,
    version: USER_DATA_BACKUP_VERSION,
    exportedAt,
    items: items.map(normalizeLibraryItem).filter(shouldKeepLibraryItem).sort((a, b) => a.key.localeCompare(b.key)),
    tagPresets: normalizeTags(tagPresets),
  };
}

export function parseUserDataBackup(value: unknown): UserDataBackup {
  const parsed = UserDataBackupSchema.parse(value);
  const items = parsed.items.map((item) => {
    const legacy = item as typeof item & { type?: ChartType; levelIndex?: number };
    const gameId = (item as UserLibraryItem).gameId ?? 'maimai';
    const chartId = item.kind === 'chart' && !('chartId' in item)
      ? canonicalChartId(gameId, item.songId, legacy.type, legacy.levelIndex ?? 0)
      : item.kind === 'chart'
        ? item.chartId
        : undefined;
    return normalizeLibraryItem({
      ...(item as UserLibraryItem),
      gameId,
      ...(item.kind === 'chart' ? { chartId } : {}),
    });
  }).filter(shouldKeepLibraryItem).sort((a, b) => a.key.localeCompare(b.key));
  return parsed.version === 1
    ? { ...parsed, items }
    : { ...parsed, items, tagPresets: normalizeTags(parsed.tagPresets) };
}

export function mergeLibraryItems(localItems: readonly UserLibraryItem[], importedItems: readonly UserLibraryItem[]): UserLibraryItem[] {
  const merged = new Map(localItems.map((item) => {
    const normalized = normalizeLibraryItem(item);
    return [normalized.key, normalized] as const;
  }));
  for (const importedValue of importedItems) {
    const imported = normalizeLibraryItem(importedValue);
    const local = merged.get(imported.key);
    if (!local || local.kind !== imported.kind) {
      merged.set(imported.key, imported);
      continue;
    }
    const tags = normalizeTags([...local.tags, ...imported.tags]);
    const common = {
      ...local,
      tags,
      createdAt: local.createdAt < imported.createdAt ? local.createdAt : imported.createdAt,
      updatedAt: local.updatedAt > imported.updatedAt ? local.updatedAt : imported.updatedAt,
    };
    merged.set(imported.key, local.kind === 'song'
      ? { ...common, kind: 'song', gameId: local.gameId, songId: local.songId, favorite: local.favorite || (imported as SongLibraryItem).favorite }
      : {
        ...common,
        kind: 'chart',
        gameId: local.gameId,
        songId: local.songId,
        chartId: local.chartId!,
        type: local.type,
        levelIndex: local.levelIndex,
        practice: local.practice || (imported as ChartLibraryItem).practice,
      });
  }
  return [...merged.values()].filter(shouldKeepLibraryItem).sort((a, b) => a.key.localeCompare(b.key));
}

export function backupPreview(backup: UserDataBackup): { songs: number; charts: number; tags: number } {
  const tagKeys = new Set<string>();
  for (const item of backup.items) for (const tag of item.tags) tagKeys.add(normalizeTagName(tag).key);
  return {
    songs: backup.items.filter((item) => item.kind === 'song').length,
    charts: backup.items.filter((item) => item.kind === 'chart').length,
    tags: tagKeys.size,
  };
}
