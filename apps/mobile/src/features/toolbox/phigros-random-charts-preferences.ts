import { createPreferencesStore } from '@/storage/create-preferences-store';
import type { PhigrosLevel } from '@/domain/phigros';
import type { PhigrosRankFilter } from '@/domain/phigros-filters';
import type {
  PhigrosRandomChartFilters,
  RandomChartsCount,
} from '@/domain/random-charts';
import type { PhigrosXingKind } from '@/domain/phigros-xing';

export type PhigrosRandomChartsCount = RandomChartsCount;

export type PhigrosRandomChartsPreferences = PhigrosRandomChartFilters & {
  count: PhigrosRandomChartsCount;
};

type StoredPhigrosRandomChartsPreferencesV3 = {
  version: 3;
} & PhigrosRandomChartsPreferences;

const STORE_KEY = 'rranker.toolbox.phigros-random-charts.v1';
const VALID_COUNTS = new Set<PhigrosRandomChartsCount>([1, 2, 3, 4]);
const VALID_LEVELS = new Set<PhigrosLevel>([0, 1, 2, 3]);
const VALID_RANKS = new Set<PhigrosRankFilter>(['phi', 'fc', 'v', 's', 'a', 'b', 'c', 'f']);
const VALID_XING = new Set<PhigrosXingKind>(['good', 'miss']);
const LEGACY_DIFFICULTY_TO_LEVEL = new Map([
  ['basic', 0],
  ['advanced', 1],
  ['expert', 2],
  ['master', 3],
] as const);

export function defaultPhigrosRandomChartsPreferences(): PhigrosRandomChartsPreferences {
  return {
    count: 1,
    level: 'all',
    constantMin: '',
    constantMax: '',
    accuracyMin: '',
    accuracyMax: '',
    rank: null,
    xing: null,
    chapter: 'all',
    selectedKyouTagIds: [],
  };
}

function parseInput(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, 16);
}

function parseLegacyLevel(value: unknown): PhigrosLevel | 'all' {
  if (!Array.isArray(value)) return 'all';
  const valid = [...new Set(value)].flatMap((item) => {
    const level = typeof item === 'string' ? LEGACY_DIFFICULTY_TO_LEVEL.get(item as never) : undefined;
    return level === undefined ? [] : [level];
  });
  return valid.length === 1 ? valid[0]! : 'all';
}

function parseTagIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is number => (
    typeof item === 'number' && Number.isInteger(item) && item > 0
  )))];
}

export function parsePhigrosRandomChartsPreferences(
  value: unknown,
): PhigrosRandomChartsPreferences {
  const output = defaultPhigrosRandomChartsPreferences();
  if (!value || typeof value !== 'object') return output;
  const raw = value as Record<string, unknown>;

  if (typeof raw.count === 'number' && VALID_COUNTS.has(raw.count as PhigrosRandomChartsCount)) {
    output.count = raw.count as PhigrosRandomChartsCount;
  }
  if (raw.version === 1) {
    output.level = parseLegacyLevel(raw.difficulties);
    output.constantMin = parseInput(raw.constantMin);
    output.constantMax = parseInput(raw.constantMax);
    return output;
  }
  if (raw.version !== 2 && raw.version !== 3) return defaultPhigrosRandomChartsPreferences();

  if (raw.level === 'all'
    || (typeof raw.level === 'number' && VALID_LEVELS.has(raw.level as PhigrosLevel))) {
    output.level = raw.level as PhigrosLevel | 'all';
  }
  output.constantMin = parseInput(raw.constantMin);
  output.constantMax = parseInput(raw.constantMax);
  output.accuracyMin = parseInput(raw.accuracyMin);
  output.accuracyMax = parseInput(raw.accuracyMax);
  if (typeof raw.rank === 'string' && VALID_RANKS.has(raw.rank as PhigrosRankFilter)) {
    output.rank = raw.rank as PhigrosRankFilter;
  }
  if (typeof raw.xing === 'string' && VALID_XING.has(raw.xing as PhigrosXingKind)) {
    output.xing = raw.xing as PhigrosXingKind;
  }
  if (typeof raw.chapter === 'string' && (raw.chapter === 'all' || /^\d+$/.test(raw.chapter))) {
    output.chapter = raw.chapter;
  }
  if (raw.version === 3) output.selectedKyouTagIds = parseTagIds(raw.selectedKyouTagIds);
  return output;
}

const { Store: PhigrosRandomChartsPreferencesStore } =
  createPreferencesStore<PhigrosRandomChartsPreferences>({
    storeKey: STORE_KEY,
    defaults: defaultPhigrosRandomChartsPreferences,
    parse: parsePhigrosRandomChartsPreferences,
    toStored: (preferences) => ({
      version: 3,
      ...parsePhigrosRandomChartsPreferences({ version: 3, ...preferences }),
    }) satisfies StoredPhigrosRandomChartsPreferencesV3,
  });

export { PhigrosRandomChartsPreferencesStore };

export const phigrosRandomChartsPreferencesStore = new PhigrosRandomChartsPreferencesStore();
