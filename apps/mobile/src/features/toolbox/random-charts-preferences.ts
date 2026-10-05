import { z } from 'zod';
import { createPreferencesStore } from '@/storage/create-preferences-store';
import type { MaimaiFcAchievement, MaimaiFsAchievement } from '@/domain/maimai-filters';
import type { ChartType, Difficulty } from '@/domain/models';
import type {
  MaimaiRandomChartFilters,
  RandomChartsCount,
} from '@/domain/random-charts';
import type { VersionNameLocale } from '@/domain/version-names';

export type { RandomChartsCount };

export type RandomChartsPreferences = MaimaiRandomChartFilters & {
  count: RandomChartsCount;
  versionLocale: VersionNameLocale;
};

type StoredRandomChartsPreferencesV3 = {
  schemaVersion: 3;
} & RandomChartsPreferences;

const STORE_KEY = 'rranker.toolbox.random-charts.v1';
const VALID_COUNTS = new Set<RandomChartsCount>([1, 2, 3, 4]);
const VALID_DIFFICULTIES = new Set<Difficulty>([
  'basic', 'advanced', 'expert', 'master', 'remaster', 'utage',
]);
const VALID_TYPES = new Set<ChartType>(['SD', 'DX', 'UTAGE']);
const VALID_SOLO = new Set<MaimaiFcAchievement>(['fc', 'fcp', 'ap', 'app']);
const VALID_MULTI = new Set<MaimaiFsAchievement>(['fs', 'fsp', 'fsd', 'fsdp']);

export function defaultRandomChartsPreferences(): RandomChartsPreferences {
  return {
    count: 1,
    difficulty: 'all',
    version: 'all',
    type: 'all',
    constantMin: '',
    constantMax: '',
    achievementMin: '',
    achievementMax: '',
    soloAchievement: null,
    multiAchievement: null,
    selectedDxRatingTagIds: [],
    versionLocale: 'china',
  };
}

function parseInput(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, 16);
}

function parseTagIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<number>();
  const result: number[] = [];
  for (const item of value) {
    if (typeof item !== 'number' || !Number.isFinite(item) || item < 0) continue;
    const tagId = Math.trunc(item);
    if (seen.has(tagId)) continue;
    seen.add(tagId);
    result.push(tagId);
  }
  return result;
}

export function parseRandomChartsPreferences(value: unknown): RandomChartsPreferences {
  const output = defaultRandomChartsPreferences();
  if (!value || typeof value !== 'object') return output;
  const raw = value as Record<string, unknown>;
  if (raw.schemaVersion !== 3) return output;

  if (typeof raw.count === 'number' && VALID_COUNTS.has(raw.count as RandomChartsCount)) {
    output.count = raw.count as RandomChartsCount;
  }


  if (raw.difficulty === 'all'
    || (typeof raw.difficulty === 'string' && VALID_DIFFICULTIES.has(raw.difficulty as Difficulty))) {
    output.difficulty = raw.difficulty as Difficulty | 'all';
  }
  if (raw.version === 'all' || typeof raw.version === 'string') {
    output.version = raw.version as string | 'all';
  }
  if (raw.type === 'all'
    || (typeof raw.type === 'string' && VALID_TYPES.has(raw.type as ChartType))) {
    output.type = raw.type as ChartType | 'all';
  }
  output.constantMin = parseInput(raw.constantMin);
  output.constantMax = parseInput(raw.constantMax);
  output.achievementMin = parseInput(raw.achievementMin);
  output.achievementMax = parseInput(raw.achievementMax);
  if (typeof raw.soloAchievement === 'string'
    && VALID_SOLO.has(raw.soloAchievement as MaimaiFcAchievement)) {
    output.soloAchievement = raw.soloAchievement as MaimaiFcAchievement;
  }
  if (typeof raw.multiAchievement === 'string'
    && VALID_MULTI.has(raw.multiAchievement as MaimaiFsAchievement)) {
    output.multiAchievement = raw.multiAchievement as MaimaiFsAchievement;
  }
  output.selectedDxRatingTagIds = parseTagIds(raw.selectedDxRatingTagIds);
  if (raw.versionLocale === 'china' || raw.versionLocale === 'japan') {
    output.versionLocale = raw.versionLocale;
  }
  return output;
}

function toStored(preferences: RandomChartsPreferences): StoredRandomChartsPreferencesV3 {
  const parsed = parseRandomChartsPreferences({
    ...preferences,
    schemaVersion: 3,
  });
  return {
    schemaVersion: 3,
    ...parsed,
  };
}

const { Store: RandomChartsPreferencesStore } = createPreferencesStore<RandomChartsPreferences>({
  storeKey: STORE_KEY,
  defaults: defaultRandomChartsPreferences,
  parse: value => parseRandomChartsPreferences(z.object({
    schemaVersion: z.literal(3),
    count: z.number(),
    difficulty: z.string(),
    version: z.string(),
    type: z.string(),
    constantMin: z.string(),
    constantMax: z.string(),
    achievementMin: z.string(),
    achievementMax: z.string(),
    soloAchievement: z.string().nullable(),
    multiAchievement: z.string().nullable(),
    selectedDxRatingTagIds: z.array(z.number()),
    versionLocale: z.string(),
  }).parse(value)),
  toStored,
});

export { RandomChartsPreferencesStore };

export const randomChartsPreferencesStore = new RandomChartsPreferencesStore();
