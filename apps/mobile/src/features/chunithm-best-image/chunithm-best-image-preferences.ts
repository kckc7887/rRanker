import Storage from 'expo-sqlite/kv-store';
import type { ChunithmBestImageSelectionCount } from './chunithm-best-image';

export type ChunithmBestImageStylePreferences = {
  version: 1;
  selectionCount: ChunithmBestImageSelectionCount;
};

const PREFIX = 'rranker.chunithm-best-image.styles.v1:';
const defaults: ChunithmBestImageStylePreferences = {
  version: 1,
  selectionCount: 0,
};

export function parseChunithmBestImageStylePreferences(
  value: unknown,
): ChunithmBestImageStylePreferences {
  if (!value || typeof value !== 'object' || (value as { version?: unknown }).version !== 1) {
    return defaults;
  }
  const raw = value as { selectionCount?: unknown };
  const selectionCount = raw.selectionCount === 5 || raw.selectionCount === 10
    ? raw.selectionCount
    : 0;
  return { version: 1, selectionCount };
}

export const chunithmBestImagePreferencesStore = {
  async load(accountId: string): Promise<ChunithmBestImageStylePreferences> {
    try {
      const raw = await Storage.getItem(`${PREFIX}${accountId}`);
      return raw ? parseChunithmBestImageStylePreferences(JSON.parse(raw)) : defaults;
    } catch {
      return defaults;
    }
  },
  async save(accountId: string, value: ChunithmBestImageStylePreferences): Promise<void> {
    await Storage.setItem(`${PREFIX}${accountId}`, JSON.stringify(value));
  },
};
