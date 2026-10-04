import { z } from 'zod';
import Storage from '@/storage/key-value-storage';
import { createPreferencesStore, type KeyValueStore } from '@/storage/create-preferences-store';
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
  if (raw.version !== 3 || !raw.selections || typeof raw.selections !== 'object') {
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
  const ratingStyle: BestImageRatingStyle = raw.ratingStyle === 'app' ? 'app' : 'game';
  return { version: 3, selections: output, ratingStyle };
}

const { load, save } = createPreferencesStore<BestImageStylePreferencesV3, string | null | undefined>({
  storeKey: keyFor,
  defaults: () => ({ version: 3, selections: {}, ratingStyle: 'game' }),
  parse: value => {
    const stored = z.object({
      version: z.literal(3),
      selections: z.record(z.string(), z.union([
        z.object({ mode: z.literal('off') }),
        z.object({
          mode: z.enum(['item', 'random']),
          item: z.object({
            id: z.number().int().nonnegative(), kind: z.enum(['icon', 'plate', 'trophy', 'frame']), name: z.string(),
            color: z.string().nullable().optional(), genre: z.string().nullable().optional(), description: z.string().optional(),
          }),
        }),
      ])),
      ratingStyle: z.enum(['game', 'app']),
    }).parse(value);
    for (const [kind, choice] of Object.entries(stored.selections)) {
      if (!KINDS.includes(kind as BestImageCollectionKind) || (choice.mode !== 'off' && choice.item.kind !== kind)) {
        throw new Error('不支持的成绩图藏品选择');
      }
    }
    return parseBestImageStylePreferences(stored);
  },
});

export class BestImageStylePreferencesStore {
  constructor(private readonly storage: KeyValueStore = Storage) {}

  load(accountId: string | null | undefined): Promise<BestImageStylePreferencesV3> {
    return load(this.storage, accountId);
  }

  async save(
    accountId: string | null | undefined,
    selections: BestImageStyleSelections,
    ratingStyle: BestImageRatingStyle = 'game',
  ): Promise<void> {
    await save(this.storage, accountId, { version: 3, selections, ratingStyle });
  }
}

export const bestImageStylePreferencesStore = new BestImageStylePreferencesStore();
