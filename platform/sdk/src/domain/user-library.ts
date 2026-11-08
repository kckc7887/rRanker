import { z } from 'zod';
import type { DetailTarget } from '@rranker/sdk/navigation';
import type { LibraryTarget, SongLibraryTarget, ChartLibraryTarget } from '@rranker/sdk/library';

export type { LibraryTarget, SongLibraryTarget, ChartLibraryTarget } from '@rranker/sdk/library';

export const USER_DATA_BACKUP_FORMAT = 'rranker-user-data' as const;
export const USER_DATA_BACKUP_VERSION = 3 as const;
export const DEFAULT_TAG_PRESETS = ['爆发', '交互', '星星', '鬼歌', '大歌'] as const;
export const MAX_TAG_LENGTH = 24;
export const MAX_TAGS_PER_ITEM = 30;
export const MAX_TAG_PRESETS = 30;
export const MAX_BACKUP_ITEMS = 5000;
export const MAX_BACKUP_FILE_BYTES = 12 * 1024 * 1024;

export function libraryDetailTarget(item: LibraryTarget): DetailTarget {
  return { gameId: item.gameId, params: item.target };
}

type LibraryItemBase = {
  key: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};
export type SongLibraryItem = LibraryItemBase & SongLibraryTarget & { favorite: boolean };
export type ChartLibraryItem = LibraryItemBase & ChartLibraryTarget & { practice: boolean };
export type UserLibraryItem = SongLibraryItem | ChartLibraryItem;
export type RestoreMode = 'merge' | 'replace';

export interface UserDataBackup {
  format: typeof USER_DATA_BACKUP_FORMAT;
  version: typeof USER_DATA_BACKUP_VERSION;
  gameId: string;
  exportedAt: string;
  items: UserLibraryItem[];
  tagPresets: string[];
}

const TimestampSchema = z.string().datetime();
const IdentifierSchema = z.string().min(1).max(1024);
const TagSchema = z.string().min(1).max(128);
const CommonItemShape = {
  key: z.string().min(1).max(4096),
  gameId: IdentifierSchema,
  id: IdentifierSchema,
  target: z.record(z.string().min(1), z.string()),
  tags: z.array(TagSchema).max(MAX_TAGS_PER_ITEM),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
};
export const UserLibraryItemSchema = z.discriminatedUnion('kind', [
  z.object({ ...CommonItemShape, kind: z.literal('song'), favorite: z.boolean() }).strict(),
  z.object({ ...CommonItemShape, kind: z.literal('chart'), practice: z.boolean() }).strict(),
]);
const UserDataBackupSchema = z.object({
  format: z.literal(USER_DATA_BACKUP_FORMAT),
  version: z.literal(USER_DATA_BACKUP_VERSION),
  gameId: IdentifierSchema,
  exportedAt: TimestampSchema,
  items: z.array(UserLibraryItemSchema).max(MAX_BACKUP_ITEMS),
  tagPresets: z.array(TagSchema).max(MAX_TAG_PRESETS),
}).strict();

export function libraryTargetKey(target: Pick<LibraryTarget, 'gameId' | 'kind' | 'id'>): string {
  return JSON.stringify([target.gameId, target.kind, target.id]);
}

export function normalizeTagName(value: string): { displayName: string; key: string } {
  const displayName = value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
  if (!displayName) throw new Error('标签不能为空');
  if (Array.from(displayName).length > MAX_TAG_LENGTH) throw new Error(`标签不能超过 ${MAX_TAG_LENGTH} 个字符`);
  return { displayName, key: displayName.toLowerCase() };
}

function normalizeTagList(values: readonly string[], limit: number, message: string): string[] {
  const byKey = new Map<string, string>();
  for (const value of values) {
    const normalized = normalizeTagName(value);
    if (!byKey.has(normalized.key)) byKey.set(normalized.key, normalized.displayName);
  }
  if (byKey.size > limit) throw new Error(message);
  return [...byKey.values()];
}

export function normalizeTags(values: readonly string[]): string[] {
  return normalizeTagList(values, MAX_TAGS_PER_ITEM, `每个项目最多添加 ${MAX_TAGS_PER_ITEM} 个标签`);
}

export function normalizeTagPresets(values: readonly string[]): string[] {
  return normalizeTagList(values, MAX_TAG_PRESETS, `标签预设最多 ${MAX_TAG_PRESETS} 个`);
}

export function userDataBackupBytes(backup: UserDataBackup): number {
  return new TextEncoder().encode(`${JSON.stringify(backup, null, 2)}\n`).byteLength;
}

export function assertUserDataBackupExportable(backup: UserDataBackup): void {
  if (backup.items.length > MAX_BACKUP_ITEMS) throw new Error('备份条目超过上限');
  if (userDataBackupBytes(backup) > MAX_BACKUP_FILE_BYTES) {
    throw new Error('备份超过可导入的大小上限');
  }
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
    || left.displayName.localeCompare(right.displayName, 'zh-CN')).map((item) => item.displayName);
}

export function normalizeLibraryItem(item: UserLibraryItem): UserLibraryItem {
  return { ...item, key: libraryTargetKey(item), target: { ...item.target }, tags: normalizeTags(item.tags) };
}

export function shouldKeepLibraryItem(item: UserLibraryItem): boolean {
  return item.tags.length > 0 || (item.kind === 'song' ? item.favorite : item.practice);
}

export function createUserDataBackup(
  gameId: string,
  items: readonly UserLibraryItem[],
  exportedAt = new Date().toISOString(),
  tagPresets: readonly string[] = DEFAULT_TAG_PRESETS,
): UserDataBackup {
  if (items.some(item => item.gameId !== gameId)) throw new Error('备份包含其他游戏的数据');
  return {
    format: USER_DATA_BACKUP_FORMAT,
    version: USER_DATA_BACKUP_VERSION,
    gameId,
    exportedAt,
    items: items.map(normalizeLibraryItem).filter(shouldKeepLibraryItem).sort((a, b) => a.key.localeCompare(b.key)),
    tagPresets: normalizeTagPresets(tagPresets),
  };
}

export function parseUserDataBackup(value: unknown, gameId?: string): UserDataBackup {
  const parsed = UserDataBackupSchema.parse(value);
  if (gameId !== undefined && parsed.gameId !== gameId) throw new Error('备份不属于当前游戏');
  return createUserDataBackup(parsed.gameId, parsed.items, parsed.exportedAt, parsed.tagPresets);
}

export function mergeLibraryItems(localItems: readonly UserLibraryItem[], importedItems: readonly UserLibraryItem[]): UserLibraryItem[] {
  const merged = new Map(localItems.map(item => {
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
    const common = {
      ...local,
      tags: normalizeTags([...local.tags, ...imported.tags]),
      createdAt: local.createdAt < imported.createdAt ? local.createdAt : imported.createdAt,
      updatedAt: local.updatedAt > imported.updatedAt ? local.updatedAt : imported.updatedAt,
    };
    merged.set(imported.key, local.kind === 'song'
      ? { ...common, kind: 'song', favorite: local.favorite || (imported as SongLibraryItem).favorite }
      : { ...common, kind: 'chart', practice: local.practice || (imported as ChartLibraryItem).practice });
  }
  return [...merged.values()].filter(shouldKeepLibraryItem).sort((a, b) => a.key.localeCompare(b.key));
}
