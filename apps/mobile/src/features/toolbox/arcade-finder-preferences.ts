import Storage from 'expo-sqlite/kv-store';
import type { GameId } from '@/domain/game-bind-options';
import {
  ARCADE_RADIUS_OPTIONS,
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

type KeyValueStore = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<unknown>;
  removeItem(key: string): Promise<unknown>;
};

const LEGACY_STORE_KEY = 'rranker.toolbox.arcade-finder.v1';
const VALID_RADIUS = new Set<number>(ARCADE_RADIUS_OPTIONS);

function storeKey(gameId: GameId): string {
  return `${LEGACY_STORE_KEY}:${gameId}`;
}

/** Maimai defaults to 舞萌DX; Phigros defaults to no game filter (all shops in range). */
export function defaultArcadeFinderPreferences(gameId: GameId = 'maimai'): ArcadeFinderPreferences {
  return {
    radiusKm: 10,
    titleIds: gameId === 'phigros' ? [] : [MAIMAI_DX_TITLE_ID],
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

export class ArcadeFinderPreferencesStore {
  constructor(private readonly storage: KeyValueStore = Storage) {}

  async load(gameId: GameId): Promise<ArcadeFinderPreferences> {
    try {
      const raw = await this.storage.getItem(storeKey(gameId));
      if (raw) return parseArcadeFinderPreferences(JSON.parse(raw), gameId);

      // One-time migration of the pre–per-game key into maimai prefs.
      if (gameId === 'maimai') {
        const legacy = await this.storage.getItem(LEGACY_STORE_KEY);
        if (legacy) {
          const prefs = parseArcadeFinderPreferences(JSON.parse(legacy), 'maimai');
          await this.save('maimai', prefs);
          await this.storage.removeItem(LEGACY_STORE_KEY).catch(() => undefined);
          return prefs;
        }
      }

      return defaultArcadeFinderPreferences(gameId);
    } catch {
      await this.storage.removeItem(storeKey(gameId)).catch(() => undefined);
      return defaultArcadeFinderPreferences(gameId);
    }
  }

  async save(gameId: GameId, preferences: ArcadeFinderPreferences): Promise<void> {
    const parsed = parseArcadeFinderPreferences({ version: 1, ...preferences }, gameId);
    const value: ArcadeFinderPreferencesV1 = { version: 1, ...parsed };
    await this.storage.setItem(storeKey(gameId), JSON.stringify(value));
  }
}

export const arcadeFinderPreferencesStore = new ArcadeFinderPreferencesStore();
