import { z } from 'zod';
import { createPreferencesStore } from '@/storage/create-preferences-store';
import type { GameId } from '@/domain/game-bind-options';
import { ARCADE_MAX_DISTANCE_KM } from '@/domain/arcade-shops';

export type ArcadeFinderPreferences = {
  minDistanceKm: number;
  radiusKm: number;
  titleIds: number[];
};

export type ArcadeFinderPreferencesV1 = {
  version: 1;
} & ArcadeFinderPreferences;

const STORE_KEY_PREFIX = 'rranker.toolbox.arcade-finder.v1';
const preferencesSchema = z.object({
  version: z.literal(1),
  minDistanceKm: z.number().int().min(0).max(ARCADE_MAX_DISTANCE_KM),
  radiusKm: z.number().int().min(0).max(ARCADE_MAX_DISTANCE_KM),
  titleIds: z.array(z.number().int().positive()).transform(ids => [...new Set(ids)]),
}).refine(value => value.minDistanceKm <= value.radiusKm);

function storeKey(gameId: GameId): string {
  return `${STORE_KEY_PREFIX}:${gameId}`;
}

export function defaultArcadeFinderPreferences(): ArcadeFinderPreferences {
  return {
    minDistanceKm: 0,
    radiusKm: 10,
    titleIds: [],
  };
}

export function parseArcadeFinderPreferences(
  value: unknown,
): ArcadeFinderPreferences {
  const { minDistanceKm, radiusKm, titleIds } = preferencesSchema.parse(value);
  return { minDistanceKm, radiusKm, titleIds };
}

const { Store: ArcadeFinderPreferencesStore } =
  createPreferencesStore<ArcadeFinderPreferences, GameId>({
    storeKey,
    defaults: defaultArcadeFinderPreferences,
    parse: parseArcadeFinderPreferences,
    toStored: preferences => ({
      version: 1,
      ...preferences,
    }) satisfies ArcadeFinderPreferencesV1,
  });

export { ArcadeFinderPreferencesStore };

export const arcadeFinderPreferencesStore = new ArcadeFinderPreferencesStore();
