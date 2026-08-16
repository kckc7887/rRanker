import { createPreferencesStore } from '@/storage/create-preferences-store';
import type {
  MuseDashAchievementFilter,
  MuseDashDifficultySlot,
  MuseDashDlcFilter,
} from '@/components/musedash/MuseDashFilterBar';
import type { RandomChartsCount } from '@/domain/random-charts';

export type MuseDashRandomChartsPreferences = {
  count: RandomChartsCount;
  difficultySlot: MuseDashDifficultySlot;
  dlc: MuseDashDlcFilter;
  constantMin: string;
  constantMax: string;
  accMin: string;
  accMax: string;
  achievement: MuseDashAchievementFilter;
};

type StoredMuseDashRandomChartsPreferencesV1 = {
  schemaVersion: 1;
} & MuseDashRandomChartsPreferences;

const STORE_KEY = 'rranker.toolbox.musedash-random-charts.v1';
const VALID_COUNTS = new Set<RandomChartsCount>([1, 2, 3, 4]);
const VALID_SLOTS = new Set<MuseDashDifficultySlot>(['all', 0, 1, 2, 3, 4]);
const VALID_ACHIEVEMENTS = new Set<MuseDashAchievementFilter>(['all', 'fc', 'ap']);

export function defaultMuseDashRandomChartsPreferences(): MuseDashRandomChartsPreferences {
  return {
    count: 1,
    difficultySlot: 'all',
    dlc: 'all',
    constantMin: '',
    constantMax: '',
    accMin: '',
    accMax: '',
    achievement: 'all',
  };
}

function parseInput(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, 16);
}

export function parseMuseDashRandomChartsPreferences(
  value: unknown,
): MuseDashRandomChartsPreferences {
  const output = defaultMuseDashRandomChartsPreferences();
  if (!value || typeof value !== 'object') return output;
  const raw = value as Record<string, unknown>;
  if (raw.schemaVersion !== 1) return output;

  if (typeof raw.count === 'number' && VALID_COUNTS.has(raw.count as RandomChartsCount)) {
    output.count = raw.count as RandomChartsCount;
  }
  if (raw.difficultySlot === 'all'
    || (typeof raw.difficultySlot === 'number'
      && VALID_SLOTS.has(raw.difficultySlot as MuseDashDifficultySlot))) {
    output.difficultySlot = raw.difficultySlot as MuseDashDifficultySlot;
  }
  if (typeof raw.dlc === 'string' && raw.dlc.length > 0) {
    output.dlc = raw.dlc as MuseDashDlcFilter;
  }
  output.constantMin = parseInput(raw.constantMin);
  output.constantMax = parseInput(raw.constantMax);
  output.accMin = parseInput(raw.accMin);
  output.accMax = parseInput(raw.accMax);
  if (typeof raw.achievement === 'string'
    && VALID_ACHIEVEMENTS.has(raw.achievement as MuseDashAchievementFilter)) {
    output.achievement = raw.achievement as MuseDashAchievementFilter;
  }
  return output;
}

const { Store: MuseDashRandomChartsPreferencesStore } =
  createPreferencesStore<MuseDashRandomChartsPreferences>({
    storeKey: STORE_KEY,
    defaults: defaultMuseDashRandomChartsPreferences,
    parse: parseMuseDashRandomChartsPreferences,
    toStored: (preferences) => ({
      schemaVersion: 1,
      ...parseMuseDashRandomChartsPreferences({ schemaVersion: 1, ...preferences }),
    }) satisfies StoredMuseDashRandomChartsPreferencesV1,
  });

export { MuseDashRandomChartsPreferencesStore };

export const museDashRandomChartsPreferencesStore =
  new MuseDashRandomChartsPreferencesStore();
