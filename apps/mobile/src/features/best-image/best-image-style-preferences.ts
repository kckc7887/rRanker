import Storage from 'expo-sqlite/kv-store';
import type { CollectionItem } from '@/domain/models';

export type BestImageCollectionKind = 'icon' | 'plate' | 'trophy' | 'frame';
export type BestImageCollectionSelectionMode = 'current' | 'random' | 'off' | 'item';
export type BestImageCollectionChoice =
  | { mode: 'current' }
  | { mode: 'off' }
  | { mode: 'random' | 'item'; item: CollectionItem };
export type AppliedBestImageStyleSelection = Exclude<BestImageCollectionChoice, { mode: 'current' }>;
export type BestImageStyleSelections = Partial<Record<BestImageCollectionKind, AppliedBestImageStyleSelection>>;
export type BestImageRatingStyle = 'game' | 'app';

export type BestImageStylePreferencesV3 = {
  version: 3;
  selections: BestImageStyleSelections;
  ratingStyle: BestImageRatingStyle;
};

type KeyValueStore = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<unknown>;
  removeItem(key: string): Promise<unknown>;
};

const KINDS: readonly BestImageCollectionKind[] = ['icon', 'plate', 'trophy', 'frame'];
const KEY_PREFIX = 'rranker.best-image.styles.v1:';

function keyFor(accountId: string | null | undefined): string {
  return `${KEY_PREFIX}${accountId?.trim() || 'local-preview'}`;
}

function parseItem(value: unknown, expectedKind: BestImageCollectionKind): CollectionItem | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (raw.kind !== expectedKind || typeof raw.id !== 'number' || !Number.isSafeInteger(raw.id) || raw.id < 0 || typeof raw.name !== 'string') return null;
  return {
    id: raw.id,
    kind: expectedKind,
    name: raw.name,
    color: typeof raw.color === 'string' || raw.color === null ? raw.color : undefined,
    genre: typeof raw.genre === 'string' || raw.genre === null ? raw.genre : undefined,
    description: typeof raw.description === 'string' ? raw.description : undefined,
    requirements: [],
  };
}

export function parseBestImageStylePreferences(value: unknown): BestImageStylePreferencesV3 {
  const output: BestImageStyleSelections = {};
  if (!value || typeof value !== 'object') return { version: 3, selections: output, ratingStyle: 'game' };
  const raw = value as { version?: unknown; selections?: unknown; ratingStyle?: unknown };
  if ((raw.version !== 1 && raw.version !== 2 && raw.version !== 3) || !raw.selections || typeof raw.selections !== 'object') {
    return { version: 3, selections: output, ratingStyle: 'game' };
  }
  const selections = raw.selections as Record<string, unknown>;
  for (const kind of KINDS) {
    const candidate = selections[kind];
    if (!candidate || typeof candidate !== 'object') continue;
    const selection = candidate as { mode?: unknown; item?: unknown };
    if (selection.mode === 'off') output[kind] = { mode: 'off' };
    else if (selection.mode === 'item' || selection.mode === 'random') {
      const item = parseItem(selection.item, kind);
      if (item) output[kind] = { mode: selection.mode, item };
    }
  }
  const ratingStyle: BestImageRatingStyle = raw.version === 3 && raw.ratingStyle === 'app'
    ? 'app'
    : raw.version === 2 && (raw.ratingStyle === 'app-capsule' || raw.ratingStyle === 'app-rect')
      ? 'app'
      : 'game';
  return { version: 3, selections: output, ratingStyle };
}

export class BestImageStylePreferencesStore {
  constructor(private readonly storage: KeyValueStore = Storage) {}

  async load(accountId: string | null | undefined): Promise<BestImageStylePreferencesV3> {
    const key = keyFor(accountId);
    try {
      const raw = await this.storage.getItem(key);
      if (!raw) return { version: 3, selections: {}, ratingStyle: 'game' };
      return parseBestImageStylePreferences(JSON.parse(raw));
    } catch {
      await this.storage.removeItem(key).catch(() => undefined);
      return { version: 3, selections: {}, ratingStyle: 'game' };
    }
  }

  async save(
    accountId: string | null | undefined,
    selections: BestImageStyleSelections,
    ratingStyle: BestImageRatingStyle = 'game',
  ): Promise<void> {
    const value: BestImageStylePreferencesV3 = { version: 3, selections, ratingStyle };
    await this.storage.setItem(keyFor(accountId), JSON.stringify(value));
  }
}

export const bestImageStylePreferencesStore = new BestImageStylePreferencesStore();
