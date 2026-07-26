import Storage from 'expo-sqlite/kv-store';
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

const STORE_KEY = 'rranker.toolbox.arcade-finder.v1';
const VALID_RADIUS = new Set<number>(ARCADE_RADIUS_OPTIONS);

export function defaultArcadeFinderPreferences(): ArcadeFinderPreferences {
  return {
    radiusKm: 10,
    titleIds: [MAIMAI_DX_TITLE_ID],
  };
}

export function parseArcadeFinderPreferences(value: unknown): ArcadeFinderPreferences {
  const output = defaultArcadeFinderPreferences();
  if (!value || typeof value !== 'object') return output;
  const raw = value as Record<string, unknown>;
  if (raw.version !== 1) return output;

  if (typeof raw.radiusKm === 'number' && VALID_RADIUS.has(raw.radiusKm)) {
    output.radiusKm = raw.radiusKm as ArcadeRadiusKm;
  }

  if (Array.isArray(raw.titleIds)) {
    const ids = [...new Set(raw.titleIds)]
      .filter((item): item is number => typeof item === 'number' && Number.isInteger(item) && item > 0);
    if (ids.length > 0) output.titleIds = ids;
  }

  return output;
}

export class ArcadeFinderPreferencesStore {
  constructor(private readonly storage: KeyValueStore = Storage) {}

  async load(): Promise<ArcadeFinderPreferences> {
    try {
      const raw = await this.storage.getItem(STORE_KEY);
      return raw ? parseArcadeFinderPreferences(JSON.parse(raw)) : defaultArcadeFinderPreferences();
    } catch {
      await this.storage.removeItem(STORE_KEY).catch(() => undefined);
      return defaultArcadeFinderPreferences();
    }
  }

  async save(preferences: ArcadeFinderPreferences): Promise<void> {
    const parsed = parseArcadeFinderPreferences({ version: 1, ...preferences });
    const value: ArcadeFinderPreferencesV1 = { version: 1, ...parsed };
    await this.storage.setItem(STORE_KEY, JSON.stringify(value));
  }
}

export const arcadeFinderPreferencesStore = new ArcadeFinderPreferencesStore();
