import { z } from 'zod';
import { chartVersionKey, normalizeSongId } from './catalog';
import type { ChartType } from './models';

export const USER_DATA_BACKUP_FORMAT = 'rranker-user-data' as const;
export const USER_DATA_BACKUP_VERSION = 1 as const;
export const MAX_TAG_LENGTH = 24;
export const MAX_TAGS_PER_ITEM = 30;
export const MAX_BACKUP_ITEMS = 5000;

export interface SongLibraryTarget {
  kind: 'song';
  songId: string;
}

export interface ChartLibraryTarget {
  kind: 'chart';
  songId: string;
  type: ChartType;
  levelIndex: number;
}

export type LibraryTarget = SongLibraryTarget | ChartLibraryTarget;

interface LibraryItemBase {
  key: string;
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
  type: ChartType;
  levelIndex: number;
  practice: boolean;
}

export type UserLibraryItem = SongLibraryItem | ChartLibraryItem;
export type RestoreMode = 'merge' | 'replace';

export interface UserDataBackupV1 {
  format: typeof USER_DATA_BACKUP_FORMAT;
  version: typeof USER_DATA_BACKUP_VERSION;
  exportedAt: string;
  items: UserLibraryItem[];
}

const TimestampSchema = z.string().datetime();
const SongIdSchema = z.string().trim().min(1).max(64);
const TagSchema = z.string().min(1).max(128);
const CommonItemShape = {
  key: z.string().min(1).max(160),
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

const ChartItemSchema = z.object({
  ...CommonItemShape,
  kind: z.literal('chart'),
  type: z.enum(['SD', 'DX']),
  levelIndex: z.number().int().min(0).max(255),
  practice: z.boolean(),
}).strict();

const UserDataBackupSchema = z.object({
  format: z.literal(USER_DATA_BACKUP_FORMAT),
  version: z.literal(USER_DATA_BACKUP_VERSION),
  exportedAt: TimestampSchema,
  items: z.array(z.discriminatedUnion('kind', [SongItemSchema, ChartItemSchema])).max(MAX_BACKUP_ITEMS),
}).strict();

export function songLibraryKey(songId: string | number): string {
  return `song:${normalizeSongId(songId)}`;
}

export function chartLibraryKey(songId: string | number, type: ChartType, levelIndex: number): string {
  return `chart:${chartVersionKey(songId, type, levelIndex)}`;
}

export function libraryTargetKey(target: LibraryTarget): string {
  return target.kind === 'song'
    ? songLibraryKey(target.songId)
    : chartLibraryKey(target.songId, target.type, target.levelIndex);
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

export function normalizeLibraryItem(item: UserLibraryItem): UserLibraryItem {
  const songId = normalizeSongId(item.songId);
  const tags = normalizeTags(item.tags);
  if (item.kind === 'song') {
    return { ...item, key: songLibraryKey(songId), songId, tags };
  }
  if (!Number.isInteger(item.levelIndex) || item.levelIndex < 0 || item.levelIndex > 255) {
    throw new Error('谱面难度序号无效');
  }
  return { ...item, key: chartLibraryKey(songId, item.type, item.levelIndex), songId, tags };
}

export function shouldKeepLibraryItem(item: UserLibraryItem): boolean {
  return item.tags.length > 0 || (item.kind === 'song' ? item.favorite : item.practice);
}

export function createUserDataBackup(items: readonly UserLibraryItem[], exportedAt = new Date().toISOString()): UserDataBackupV1 {
  return {
    format: USER_DATA_BACKUP_FORMAT,
    version: USER_DATA_BACKUP_VERSION,
    exportedAt,
    items: items.map(normalizeLibraryItem).filter(shouldKeepLibraryItem).sort((a, b) => a.key.localeCompare(b.key)),
  };
}

export function parseUserDataBackup(value: unknown): UserDataBackupV1 {
  const parsed = UserDataBackupSchema.parse(value);
  return createUserDataBackup(parsed.items as UserLibraryItem[], parsed.exportedAt);
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
      ? { ...common, kind: 'song', songId: local.songId, favorite: local.favorite || (imported as SongLibraryItem).favorite }
      : { ...common, kind: 'chart', songId: local.songId, type: local.type, levelIndex: local.levelIndex, practice: local.practice || (imported as ChartLibraryItem).practice });
  }
  return [...merged.values()].filter(shouldKeepLibraryItem).sort((a, b) => a.key.localeCompare(b.key));
}

export function backupPreview(backup: UserDataBackupV1): { songs: number; charts: number; tags: number } {
  const tagKeys = new Set<string>();
  for (const item of backup.items) for (const tag of item.tags) tagKeys.add(normalizeTagName(tag).key);
  return {
    songs: backup.items.filter((item) => item.kind === 'song').length,
    charts: backup.items.filter((item) => item.kind === 'chart').length,
    tags: tagKeys.size,
  };
}
