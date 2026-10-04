import Storage from '@/storage/key-value-storage';
import { z } from 'zod';
import { createPreferencesStore } from './create-preferences-store';
import type { GameId } from '@/domain/game-bind-options';

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
  if ((input.version !== undefined && input.version !== 1) || !Array.isArray(input.selectedIds)) return fallback;
  const selectedIds = input.selectedIds.filter(
    (id): id is StorageClearCategoryId => typeof id === 'string' && allowed.has(id as StorageClearCategoryId),
  );
  return { version: 1, selectedIds };
}

export class StorageClearPreferencesStore {
  async load(allowedIds: readonly StorageClearCategoryId[]): Promise<StorageClearPreferences> {
    return load(Storage, allowedIds);
  }

  async save(preferences: StorageClearPreferences): Promise<void> {
    await save(Storage, [], preferences);
  }
}

const { load, save } = createPreferencesStore<StorageClearPreferences, readonly StorageClearCategoryId[]>({
  storeKey: STORAGE_KEY,
  defaults: allowedIds => ({ version: 1, selectedIds: [...allowedIds] }),
  parse: (value, allowedIds) => parseStorageClearPreferences(z.object({
    version: z.literal(1), selectedIds: z.array(z.string()),
  }).parse(value), allowedIds),
});

export const storageClearPreferencesStore = new StorageClearPreferencesStore();
