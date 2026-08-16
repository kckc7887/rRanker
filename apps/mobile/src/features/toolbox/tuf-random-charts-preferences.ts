import Storage from 'expo-sqlite/kv-store';
import type { RandomChartsCount } from '@/domain/random-charts';
import type { TufDifficultyBand, TufPassAchievementFilter } from '@/domain/tuf';

export type TufRandomChartsPreferences = {
  count: RandomChartsCount;
  difficultyBand: TufDifficultyBand;
  difficultyMin: string;
  difficultyMax: string;
  includeSpecial: boolean;
  achievement: TufPassAchievementFilter;
};

type StoredTufRandomChartsPreferencesV1 = {
  schemaVersion: 1;
} & TufRandomChartsPreferences;

type KeyValueStore = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<unknown>;
  removeItem(key: string): Promise<unknown>;
};

const STORE_KEY = 'rranker.toolbox.tuf-random-charts.v1';
const VALID_COUNTS = new Set<RandomChartsCount>([1, 2, 3, 4]);
const VALID_BANDS = new Set<TufDifficultyBand>(['all', 'P', 'G', 'U']);
const VALID_ACHIEVEMENTS = new Set<TufPassAchievementFilter>(['all', 'wf', 'pp']);

export function defaultTufRandomChartsPreferences(): TufRandomChartsPreferences {
  return {
    count: 1,
    difficultyBand: 'all',
    difficultyMin: '',
    difficultyMax: '',
    includeSpecial: true,
    achievement: 'all',
  };
}

function parseInput(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, 16);
}

export function parseTufRandomChartsPreferences(
  value: unknown,
): TufRandomChartsPreferences {
  const output = defaultTufRandomChartsPreferences();
  if (!value || typeof value !== 'object') return output;
  const raw = value as Record<string, unknown>;
  if (raw.schemaVersion !== 1) return output;

  if (typeof raw.count === 'number' && VALID_COUNTS.has(raw.count as RandomChartsCount)) {
    output.count = raw.count as RandomChartsCount;
  }
  if (typeof raw.difficultyBand === 'string'
    && VALID_BANDS.has(raw.difficultyBand as TufDifficultyBand)) {
    output.difficultyBand = raw.difficultyBand as TufDifficultyBand;
  }
  output.difficultyMin = parseInput(raw.difficultyMin);
  output.difficultyMax = parseInput(raw.difficultyMax);
  if (typeof raw.includeSpecial === 'boolean') {
    output.includeSpecial = raw.includeSpecial;
  }
  if (typeof raw.achievement === 'string'
    && VALID_ACHIEVEMENTS.has(raw.achievement as TufPassAchievementFilter)) {
    output.achievement = raw.achievement as TufPassAchievementFilter;
  }
  return output;
}

export class TufRandomChartsPreferencesStore {
  constructor(private readonly storage: KeyValueStore = Storage) {}

  async load(): Promise<TufRandomChartsPreferences> {
    try {
      const raw = await this.storage.getItem(STORE_KEY);
      return raw
        ? parseTufRandomChartsPreferences(JSON.parse(raw))
        : defaultTufRandomChartsPreferences();
    } catch {
      await this.storage.removeItem(STORE_KEY).catch(() => undefined);
      return defaultTufRandomChartsPreferences();
    }
  }

  async save(preferences: TufRandomChartsPreferences): Promise<void> {
    const value: StoredTufRandomChartsPreferencesV1 = {
      schemaVersion: 1,
      ...parseTufRandomChartsPreferences({ schemaVersion: 1, ...preferences }),
    };
    await this.storage.setItem(STORE_KEY, JSON.stringify(value));
  }
}

export const tufRandomChartsPreferencesStore =
  new TufRandomChartsPreferencesStore();
