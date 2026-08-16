import { createPreferencesStore } from '@/storage/create-preferences-store';
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

const { Store: TufRandomChartsPreferencesStore } =
  createPreferencesStore<TufRandomChartsPreferences>({
    storeKey: STORE_KEY,
    defaults: defaultTufRandomChartsPreferences,
    parse: parseTufRandomChartsPreferences,
    toStored: (preferences) => ({
      schemaVersion: 1,
      ...parseTufRandomChartsPreferences({ schemaVersion: 1, ...preferences }),
    }) satisfies StoredTufRandomChartsPreferencesV1,
  });

export { TufRandomChartsPreferencesStore };

export const tufRandomChartsPreferencesStore =
  new TufRandomChartsPreferencesStore();
