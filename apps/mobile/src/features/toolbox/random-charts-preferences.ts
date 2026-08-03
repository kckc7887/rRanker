import Storage from 'expo-sqlite/kv-store';
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

type KeyValueStore = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<unknown>;
  removeItem(key: string): Promise<unknown>;
};

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

function parseLegacyDifficulty(value: unknown): Difficulty | 'all' {
  if (!Array.isArray(value)) return 'all';
  const valid = [...new Set(value)].filter(
    (item): item is Difficulty => typeof item === 'string' && VALID_DIFFICULTIES.has(item as Difficulty),
  );
  return valid.length === 1 ? valid[0]! : 'all';
}

export function parseRandomChartsPreferences(value: unknown): RandomChartsPreferences {
  const output = defaultRandomChartsPreferences();
  if (!value || typeof value !== 'object') return output;
  const raw = value as Record<string, unknown>;

  if (typeof raw.count === 'number' && VALID_COUNTS.has(raw.count as RandomChartsCount)) {
    output.count = raw.count as RandomChartsCount;
  }

  if (raw.version === 1 && raw.schemaVersion === undefined) {
    output.difficulty = parseLegacyDifficulty(raw.difficulties);
    output.constantMin = parseInput(raw.constantMin);
    output.constantMax = parseInput(raw.constantMax);
    return output;
  }
  if (raw.schemaVersion !== 2 && raw.schemaVersion !== 3) return defaultRandomChartsPreferences();

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
  if (raw.schemaVersion === 3) {
    output.selectedDxRatingTagIds = parseTagIds(raw.selectedDxRatingTagIds);
  }
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

export class RandomChartsPreferencesStore {
  constructor(private readonly storage: KeyValueStore = Storage) {}

  async load(): Promise<RandomChartsPreferences> {
    try {
      const raw = await this.storage.getItem(STORE_KEY);
      return raw ? parseRandomChartsPreferences(JSON.parse(raw)) : defaultRandomChartsPreferences();
    } catch {
      await this.storage.removeItem(STORE_KEY).catch(() => undefined);
      return defaultRandomChartsPreferences();
    }
  }

  async save(preferences: RandomChartsPreferences): Promise<void> {
    await this.storage.setItem(STORE_KEY, JSON.stringify(toStored(preferences)));
  }
}

export const randomChartsPreferencesStore = new RandomChartsPreferencesStore();
