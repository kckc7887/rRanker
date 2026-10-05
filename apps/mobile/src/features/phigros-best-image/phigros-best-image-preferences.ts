import { z } from 'zod';
import { createPreferencesStore } from '@/storage/create-preferences-store';
import type { PhigrosBestImageOverflowCount } from './phigros-best-image';

export type PhigrosImageStyleMode = 'current' | 'item' | 'random' | 'off';
export type PhigrosImageStyleChoice = { mode: PhigrosImageStyleMode; key?: string };
export type PhigrosBestImageRatingStyle = 'game' | 'app';
export type PhigrosBestImageStylePreferences = {
  version: 2;
  ratingStyle: PhigrosBestImageRatingStyle;
  avatar: PhigrosImageStyleChoice;
  background: PhigrosImageStyleChoice;
  overflowCount: PhigrosBestImageOverflowCount;
};

const PREFIX = 'rranker.phigros-best-image.styles.v1:';
const defaults: PhigrosBestImageStylePreferences = {
  version: 2, ratingStyle: 'game', avatar: { mode: 'current' }, background: { mode: 'current' }, overflowCount: 0,
};

function parseChoice(value: unknown): PhigrosImageStyleChoice {
  if (!value || typeof value !== 'object') return { mode: 'current' };
  const raw = value as { mode?: unknown; key?: unknown };
  if (raw.mode === 'off' || raw.mode === 'current') return { mode: raw.mode };
  if ((raw.mode === 'item' || raw.mode === 'random') && typeof raw.key === 'string' && raw.key) {
    return { mode: raw.mode, key: raw.key };
  }
  return { mode: 'current' };
}

export function parsePhigrosBestImageStylePreferences(value: unknown): PhigrosBestImageStylePreferences {
  if (!value || typeof value !== 'object') return defaults;
  const raw = value as { version?: unknown; ratingStyle?: unknown; avatar?: unknown; background?: unknown; overflowCount?: unknown };
  if (raw.version !== 2) return defaults;
  const overflowCount = raw.overflowCount === 3 || raw.overflowCount === 6 || raw.overflowCount === 9
    ? raw.overflowCount
    : 0;
  const ratingStyle: PhigrosBestImageRatingStyle = raw.ratingStyle === 'app' ? 'app' : 'game';
  return {
    version: 2,
    ratingStyle,
    avatar: parseChoice(raw.avatar),
    background: parseChoice(raw.background),
    overflowCount,
  };
}

const choiceSchema = z.union([z.object({ mode: z.enum(['current', 'off']) }), z.object({ mode: z.enum(['item', 'random']), key: z.string().min(1) })]);

const { Store } = createPreferencesStore<PhigrosBestImageStylePreferences, string>({
  storeKey: (accountId) => `${PREFIX}${accountId}`,
  defaults: () => defaults,
  parse: value => parsePhigrosBestImageStylePreferences(z.object({
    version: z.literal(2),
    ratingStyle: z.enum(['game', 'app']),
    avatar: choiceSchema,
    background: choiceSchema,
    overflowCount: z.number(),
  }).parse(value)),
});

export const phigrosBestImagePreferencesStore = new Store();
