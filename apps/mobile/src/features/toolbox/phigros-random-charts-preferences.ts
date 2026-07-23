import Storage from 'expo-sqlite/kv-store';
import type { Difficulty } from '@/domain/models';
import type { RandomPlayedFilter } from '@/domain/random-charts';

export type PhigrosRandomChartsCount = 1 | 2 | 3 | 4;

export type PhigrosRandomChartsPreferences = {
  count: PhigrosRandomChartsCount;
  difficulties: Difficulty[];
  constantMin: string;
  constantMax: string;
  played: RandomPlayedFilter;
};

export type PhigrosRandomChartsPreferencesV1 = {
  version: 1;
} & PhigrosRandomChartsPreferences;

type KeyValueStore = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<unknown>;
  removeItem(key: string): Promise<unknown>;
};

const STORE_KEY = 'rranker.toolbox.phigros-random-charts.v1';
const VALID_DIFFICULTIES = new Set<Difficulty>(['basic', 'advanced', 'expert', 'master']);
const VALID_PLAYED = new Set<RandomPlayedFilter>(['all', 'played', 'unplayed']);
const VALID_COUNTS = new Set<PhigrosRandomChartsCount>([1, 2, 3, 4]);

export function defaultPhigrosRandomChartsPreferences(): PhigrosRandomChartsPreferences {
  return {
    count: 1,
    difficulties: [],
    constantMin: '',
    constantMax: '',
    played: 'all',
  };
}

function parseConstantInput(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, 8);
}

export function parsePhigrosRandomChartsPreferences(value: unknown): PhigrosRandomChartsPreferences {
  const output = defaultPhigrosRandomChartsPreferences();
  if (!value || typeof value !== 'object') return output;
  const raw = value as Record<string, unknown>;
  if (raw.version !== 1) return output;

  if (typeof raw.count === 'number' && VALID_COUNTS.has(raw.count as PhigrosRandomChartsCount)) {
    output.count = raw.count as PhigrosRandomChartsCount;
  }

  if (Array.isArray(raw.difficulties)) {
    output.difficulties = [...new Set(raw.difficulties)]
      .filter((item): item is Difficulty => typeof item === 'string' && VALID_DIFFICULTIES.has(item as Difficulty));
  }

  output.constantMin = parseConstantInput(raw.constantMin);
  output.constantMax = parseConstantInput(raw.constantMax);

  if (typeof raw.played === 'string' && VALID_PLAYED.has(raw.played as RandomPlayedFilter)) {
    output.played = raw.played as RandomPlayedFilter;
  }

  return output;
}

export class PhigrosRandomChartsPreferencesStore {
  constructor(private readonly storage: KeyValueStore = Storage) {}

  async load(): Promise<PhigrosRandomChartsPreferences> {
    try {
      const raw = await this.storage.getItem(STORE_KEY);
      return raw ? parsePhigrosRandomChartsPreferences(JSON.parse(raw)) : defaultPhigrosRandomChartsPreferences();
    } catch {
      await this.storage.removeItem(STORE_KEY).catch(() => undefined);
      return defaultPhigrosRandomChartsPreferences();
    }
  }

  async save(preferences: PhigrosRandomChartsPreferences): Promise<void> {
    const parsed = parsePhigrosRandomChartsPreferences({ version: 1, ...preferences });
    const value: PhigrosRandomChartsPreferencesV1 = { version: 1, ...parsed };
    await this.storage.setItem(STORE_KEY, JSON.stringify(value));
  }
}

export const phigrosRandomChartsPreferencesStore = new PhigrosRandomChartsPreferencesStore();
