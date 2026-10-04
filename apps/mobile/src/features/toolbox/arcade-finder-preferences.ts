import { z } from 'zod';
import { createPreferencesStore } from '@/storage/create-preferences-store';
import type { GameId } from '@/domain/game-bind-options';
import {
  ARCADE_RADIUS_OPTIONS,
  CHUNITHM_TITLE_ID,
  MAIMAI_DX_TITLE_ID,
  type ArcadeRadiusKm,
} from '@/domain/arcade-shops';

export type ArcadeFinderPreferences = {
  radiusKm: ArcadeRadiusKm;
  titleIds: number[];
};

export type ArcadeFinderPreferencesV1 = {
  version: 1;
} & ArcadeFinderPreferences;

const STORE_KEY_PREFIX = 'rranker.toolbox.arcade-finder.v1';
const VALID_RADIUS = new Set<number>(ARCADE_RADIUS_OPTIONS);

function storeKey(gameId: GameId): string {
  return `${STORE_KEY_PREFIX}:${gameId}`;
}

export function defaultArcadeFinderPreferences(gameId: GameId = 'maimai'): ArcadeFinderPreferences {
  const defaultTitleIds: Record<GameId, number[]> = {
    rizline: [], 'majdata-net': [], maimai: [MAIMAI_DX_TITLE_ID],
    chunithm: [CHUNITHM_TITLE_ID],
    phigros: [],
    phira: [],
    adofai: [],
    musedash: [],
    'osu-standard': [],
    'osu-mania': [],
    'osu-catch': [],
    'osu-taiko': [],
  };
  return {
    radiusKm: 10,
    titleIds: [...defaultTitleIds[gameId]],
  };
}

export function parseArcadeFinderPreferences(
  value: unknown,
  gameId: GameId = 'maimai',
): ArcadeFinderPreferences {
  const output = defaultArcadeFinderPreferences(gameId);
  if (!value || typeof value !== 'object') return output;
  const raw = value as Record<string, unknown>;
  if (raw.version !== 1) return output;

  if (typeof raw.radiusKm === 'number' && VALID_RADIUS.has(raw.radiusKm)) {
    output.radiusKm = raw.radiusKm as ArcadeRadiusKm;
  }

  if (Array.isArray(raw.titleIds)) {
    output.titleIds = [...new Set(raw.titleIds)]
      .filter((item): item is number => typeof item === 'number' && Number.isInteger(item) && item > 0);
  }

  return output;
}

const { Store: ArcadeFinderPreferencesStore } =
  createPreferencesStore<ArcadeFinderPreferences, GameId>({
    storeKey,
    defaults: defaultArcadeFinderPreferences,
    parse: (value, gameId) => parseArcadeFinderPreferences(z.object({ version: z.literal(1), radiusKm: z.number(), titleIds: z.array(z.number()) }).parse(value), gameId),
    toStored: (preferences, gameId) => ({
      version: 1,
      ...parseArcadeFinderPreferences({ version: 1, ...preferences }, gameId),
    }) satisfies ArcadeFinderPreferencesV1,
  });

export { ArcadeFinderPreferencesStore };

export const arcadeFinderPreferencesStore = new ArcadeFinderPreferencesStore();
