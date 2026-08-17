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

const LEGACY_STORE_KEY = 'rranker.toolbox.arcade-finder.v1';
const VALID_RADIUS = new Set<number>(ARCADE_RADIUS_OPTIONS);

function storeKey(gameId: GameId): string {
  return `${LEGACY_STORE_KEY}:${gameId}`;
}

/** Each game gets its own first-visit default; persisted per-game choices remain authoritative. */
export function defaultArcadeFinderPreferences(gameId: GameId = 'maimai'): ArcadeFinderPreferences {
  const defaultTitleIds: Record<GameId, number[]> = {
    maimai: [MAIMAI_DX_TITLE_ID],
    chunithm: [CHUNITHM_TITLE_ID],
    phigros: [],
    phira: [],
    adofai: [],
    musedash: [],
    test: [],
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
    parse: parseArcadeFinderPreferences,
    toStored: (preferences, gameId) => ({
      version: 1,
      ...parseArcadeFinderPreferences({ version: 1, ...preferences }, gameId),
    }) satisfies ArcadeFinderPreferencesV1,
    // One-time migration of the pre–per-game key into maimai prefs.
    onMissing: async ({ storage, scope, save }) => {
      if (scope !== 'maimai') return null;
      const legacy = await storage.getItem(LEGACY_STORE_KEY);
      if (!legacy) return null;
      const prefs = parseArcadeFinderPreferences(JSON.parse(legacy), 'maimai');
      await save(prefs);
      await storage.removeItem(LEGACY_STORE_KEY).catch(() => undefined);
      return prefs;
    },
  });

export { ArcadeFinderPreferencesStore };

export const arcadeFinderPreferencesStore = new ArcadeFinderPreferencesStore();
