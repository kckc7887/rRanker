import Storage from 'expo-sqlite/kv-store';
import type { ChunithmBestImageSelectionCount } from './chunithm-best-image';

export type ChunithmBestImageStyleKind = 'character' | 'plate' | 'trophy';
export type ChunithmBestImageStyleMode = 'current' | 'item' | 'random' | 'off';
export type ChunithmBestImageStyleChoice = {
  mode: ChunithmBestImageStyleMode;
  id?: number;
  name?: string;
};

export type ChunithmBestImageStylePreferences = {
  version: 2;
  selectionCount: ChunithmBestImageSelectionCount;
  character: ChunithmBestImageStyleChoice;
  plate: ChunithmBestImageStyleChoice;
  trophy: ChunithmBestImageStyleChoice;
};

const PREFIX = 'rranker.chunithm-best-image.styles.v1:';
const KINDS: readonly ChunithmBestImageStyleKind[] = ['character', 'plate', 'trophy'];

export const DEFAULT_CHUNITHM_BEST_IMAGE_STYLES: ChunithmBestImageStylePreferences = {
  version: 2,
  selectionCount: 0,
  character: { mode: 'current' },
  plate: { mode: 'current' },
  trophy: { mode: 'current' },
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

export function parseChunithmBestImageStylePreferences(
  value: unknown,
): ChunithmBestImageStylePreferences {
  if (!value || typeof value !== 'object') return { ...DEFAULT_CHUNITHM_BEST_IMAGE_STYLES };
  const raw = value as {
    version?: unknown;
    selectionCount?: unknown;
    character?: unknown;
    plate?: unknown;
    trophy?: unknown;
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
  if (raw.version !== 2) return { ...DEFAULT_CHUNITHM_BEST_IMAGE_STYLES };
  return {
    version: 2,
    selectionCount,
    character: parseChoice(raw.character),
    plate: parseChoice(raw.plate),
    trophy: parseChoice(raw.trophy),
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

export const CHUNITHM_BEST_IMAGE_STYLE_KINDS = KINDS;

export const chunithmBestImagePreferencesStore = {
  async load(accountId: string): Promise<ChunithmBestImageStylePreferences> {
    try {
      const raw = await Storage.getItem(`${PREFIX}${accountId}`);
      return raw
        ? parseChunithmBestImageStylePreferences(JSON.parse(raw))
        : { ...DEFAULT_CHUNITHM_BEST_IMAGE_STYLES };
    } catch {
      return { ...DEFAULT_CHUNITHM_BEST_IMAGE_STYLES };
    }
  },
  async save(accountId: string, value: ChunithmBestImageStylePreferences): Promise<void> {
    await Storage.setItem(`${PREFIX}${accountId}`, JSON.stringify(value));
  },
};
