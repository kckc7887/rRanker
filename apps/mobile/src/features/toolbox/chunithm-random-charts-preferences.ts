import Storage from 'expo-sqlite/kv-store';
import type { ChunithmLevelIndex } from '@/domain/chunithm';
import type { ChunithmRandomChartFilters } from '@/domain/chunithm-random-charts';
import {
  CHUNITHM_RANKS_ASC,
} from '@/domain/chunithm-filters';
import type { ChunithmRank } from '@/domain/chunithm-score-presentation';
import type { RandomChartsCount } from '@/domain/random-charts';

export type ChunithmRandomChartsPreferences = ChunithmRandomChartFilters & {
  count: RandomChartsCount;
};

type StoredChunithmRandomChartsPreferencesV1 = {
  schemaVersion: 1;
} & ChunithmRandomChartsPreferences;

type KeyValueStore = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<unknown>;
  removeItem(key: string): Promise<unknown>;
};

const STORE_KEY = 'rranker.toolbox.chunithm-random-charts.v1';
const VALID_COUNTS = new Set<RandomChartsCount>([1, 2, 3, 4]);
const VALID_LEVELS = new Set<ChunithmLevelIndex>([0, 1, 2, 3, 4, 5]);
const VALID_RANKS = new Set<ChunithmRank>(CHUNITHM_RANKS_ASC);

export function defaultChunithmRandomChartsPreferences(): ChunithmRandomChartsPreferences {
  return {
    count: 1,
    difficulty: 'all',
    version: 'all',
    constantMin: '',
    constantMax: '',
    rankMin: null,
    rankMax: null,
  };
}

function parseInput(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, 16);
}

export function parseChunithmRandomChartsPreferences(
  value: unknown,
): ChunithmRandomChartsPreferences {
  const output = defaultChunithmRandomChartsPreferences();
  if (!value || typeof value !== 'object') return output;
  const raw = value as Record<string, unknown>;
  if (raw.schemaVersion !== 1) return output;

  if (typeof raw.count === 'number' && VALID_COUNTS.has(raw.count as RandomChartsCount)) {
    output.count = raw.count as RandomChartsCount;
  }
  if (raw.difficulty === 'all'
    || (typeof raw.difficulty === 'number'
      && VALID_LEVELS.has(raw.difficulty as ChunithmLevelIndex))) {
    output.difficulty = raw.difficulty as ChunithmLevelIndex | 'all';
  }
  if (raw.version === 'all' || typeof raw.version === 'string') {
    output.version = raw.version as string | 'all';
  }
  output.constantMin = parseInput(raw.constantMin);
  output.constantMax = parseInput(raw.constantMax);
  if (typeof raw.rankMin === 'string' && VALID_RANKS.has(raw.rankMin as ChunithmRank)) {
    output.rankMin = raw.rankMin as ChunithmRank;
  }
  if (typeof raw.rankMax === 'string' && VALID_RANKS.has(raw.rankMax as ChunithmRank)) {
    output.rankMax = raw.rankMax as ChunithmRank;
  }
  return output;
}

export class ChunithmRandomChartsPreferencesStore {
  constructor(private readonly storage: KeyValueStore = Storage) {}

  async load(): Promise<ChunithmRandomChartsPreferences> {
    try {
      const raw = await this.storage.getItem(STORE_KEY);
      return raw
        ? parseChunithmRandomChartsPreferences(JSON.parse(raw))
        : defaultChunithmRandomChartsPreferences();
    } catch {
      await this.storage.removeItem(STORE_KEY).catch(() => undefined);
      return defaultChunithmRandomChartsPreferences();
    }
  }

  async save(preferences: ChunithmRandomChartsPreferences): Promise<void> {
    const value: StoredChunithmRandomChartsPreferencesV1 = {
      schemaVersion: 1,
      ...parseChunithmRandomChartsPreferences({ schemaVersion: 1, ...preferences }),
    };
    await this.storage.setItem(STORE_KEY, JSON.stringify(value));
  }
}

export const chunithmRandomChartsPreferencesStore =
  new ChunithmRandomChartsPreferencesStore();
