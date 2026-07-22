import Storage from 'expo-sqlite/kv-store';
import type { GameId } from '@/domain/game-bind-options';

/** 可勾选清除的类别：各游戏 id + 共享缓存。 */
export type StorageClearCategoryId = GameId | 'shared';

export type StorageClearPreferences = {
  version: 1;
  selectedIds: StorageClearCategoryId[];
};

const STORAGE_KEY = 'rranker.storage-clear-prefs.v1';

export function parseStorageClearPreferences(
  value: unknown,
  allowedIds: readonly StorageClearCategoryId[],
): StorageClearPreferences {
  const allowed = new Set(allowedIds);
  const fallback = { version: 1 as const, selectedIds: [...allowedIds] };
  if (!value || typeof value !== 'object') return fallback;
  const input = value as { version?: unknown; selectedIds?: unknown };
  if (!Array.isArray(input.selectedIds)) return fallback;
  const selectedIds = input.selectedIds.filter(
    (id): id is StorageClearCategoryId => typeof id === 'string' && allowed.has(id as StorageClearCategoryId),
  );
  return { version: 1, selectedIds };
}

export class StorageClearPreferencesStore {
  async load(allowedIds: readonly StorageClearCategoryId[]): Promise<StorageClearPreferences> {
    try {
      const raw = await Storage.getItem(STORAGE_KEY);
      if (!raw) return parseStorageClearPreferences(null, allowedIds);
      return parseStorageClearPreferences(JSON.parse(raw), allowedIds);
    } catch {
      return parseStorageClearPreferences(null, allowedIds);
    }
  }

  async save(preferences: StorageClearPreferences): Promise<void> {
    await Storage.setItem(STORAGE_KEY, JSON.stringify({
      version: 1,
      selectedIds: preferences.selectedIds,
    }));
  }
}

export const storageClearPreferencesStore = new StorageClearPreferencesStore();
