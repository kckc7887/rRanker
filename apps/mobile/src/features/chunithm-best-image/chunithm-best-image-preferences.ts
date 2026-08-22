import { createPreferencesStore } from '@/storage/create-preferences-store';
import type { ChunithmBestImageSelectionCount } from './chunithm-best-image';

export type ChunithmBestImageStyleMode = 'current' | 'item' | 'random' | 'off';
export type ChunithmBestImageStyleChoice = {
  mode: ChunithmBestImageStyleMode;
  id?: number;
  name?: string;
};

export type ChunithmBestImageBackgroundChoice =
  | { mode: 'default' }
  | { mode: 'song'; songId: number };

export type ChunithmBestImageStylePreferences = {
  version: 3;
  selectionCount: ChunithmBestImageSelectionCount;
  character: ChunithmBestImageStyleChoice;
  background: ChunithmBestImageBackgroundChoice;
};

const PREFIX = 'rranker.chunithm-best-image.styles.v1:';

export const DEFAULT_CHUNITHM_BEST_IMAGE_STYLES: ChunithmBestImageStylePreferences = {
  version: 3,
  selectionCount: 0,
  character: { mode: 'current' },
  background: { mode: 'default' },
};

function parseChoice(value: unknown): ChunithmBestImageStyleChoice {
  if (!value || typeof value !== 'object') return { mode: 'current' };
  const raw = value as { mode?: unknown; id?: unknown; name?: unknown };
  if (raw.mode === 'off' || raw.mode === 'current') return { mode: raw.mode };
  if (
    (raw.mode === 'item' || raw.mode === 'random')
    && typeof raw.id === 'number'
    && Number.isSafeInteger(raw.id)
    && raw.id >= 0
  ) {
    return {
      mode: raw.mode,
      id: raw.id,
      name: typeof raw.name === 'string' ? raw.name : `#${raw.id}`,
    };
  }
  return { mode: 'current' };
}

function parseBackground(value: unknown): ChunithmBestImageBackgroundChoice {
  if (!value || typeof value !== 'object') return { mode: 'default' };
  const raw = value as { mode?: unknown; songId?: unknown };
  if (raw.mode === 'default') return { mode: 'default' };
  if (
    raw.mode === 'song'
    && typeof raw.songId === 'number'
    && Number.isSafeInteger(raw.songId)
    && raw.songId >= 0
  ) {
    return { mode: 'song', songId: raw.songId };
  }
  return { mode: 'default' };
}

export function parseChunithmBestImageStylePreferences(
  value: unknown,
): ChunithmBestImageStylePreferences {
  if (!value || typeof value !== 'object') return { ...DEFAULT_CHUNITHM_BEST_IMAGE_STYLES };
  const raw = value as {
    version?: unknown;
    selectionCount?: unknown;
    character?: unknown;
    background?: unknown;
  };
  const selectionCount = raw.selectionCount === 5 || raw.selectionCount === 10
    ? raw.selectionCount
    : 0;
  if (raw.version === 1) {
    return {
      ...DEFAULT_CHUNITHM_BEST_IMAGE_STYLES,
      selectionCount,
    };
  }
  if (raw.version === 2) {
    return {
      version: 3,
      selectionCount,
      character: parseChoice(raw.character),
      background: { mode: 'default' },
    };
  }
  if (raw.version !== 3) return { ...DEFAULT_CHUNITHM_BEST_IMAGE_STYLES };
  return {
    version: 3,
    selectionCount,
    character: parseChoice(raw.character),
    background: parseBackground(raw.background),
  };
}

export function resolveChunithmBestImageStyleId(
  choice: ChunithmBestImageStyleChoice,
  currentId: number | null | undefined,
): number | null {
  if (choice.mode === 'off') return null;
  if (choice.mode === 'item' || choice.mode === 'random') {
    return typeof choice.id === 'number' ? choice.id : null;
  }
  if (!Number.isSafeInteger(currentId) || (currentId ?? -1) < 0) return null;
  return currentId ?? null;
}

const { Store } = createPreferencesStore<ChunithmBestImageStylePreferences, string>({
  storeKey: (accountId) => `${PREFIX}${accountId}`,
  defaults: () => ({ ...DEFAULT_CHUNITHM_BEST_IMAGE_STYLES }),
  parse: parseChunithmBestImageStylePreferences,
  // 坏数据回退默认值，不清理对应 key。
  clearOnError: false,
});

export const chunithmBestImagePreferencesStore = new Store();
