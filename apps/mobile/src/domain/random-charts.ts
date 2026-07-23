import { chartVersionKey, normalizeSongId } from './catalog';
import { matchesConstantRange } from './maimai-filters';
import type { CatalogSnapshot, ChartType, Difficulty, ScoreRecord } from './models';

export type RandomPlayedFilter = 'all' | 'played' | 'unplayed';

export type RandomChartFilters = {
  difficulties: readonly Difficulty[];
  constantMin: string;
  constantMax: string;
  played: RandomPlayedFilter;
};

export type RandomChartPick = {
  songId: string;
  title: string;
  artist?: string;
  type: ChartType;
  difficulty: Difficulty;
  levelIndex: number;
  difficultyConstant: number;
  played: boolean;
};

export type PickRandomChartsInput = {
  catalog: CatalogSnapshot;
  records: readonly ScoreRecord[];
  filters: RandomChartFilters;
  count: number;
  seed: string;
};

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Mulberry32 — deterministic PRNG for reproducible picks. */
function createRng(seed: string): () => number {
  let state = hashSeed(seed) || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let next = state;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function clampCount(count: number): number {
  if (!Number.isFinite(count)) return 1;
  return Math.min(4, Math.max(1, Math.floor(count)));
}

function buildPlayedKeys(records: readonly ScoreRecord[]): Set<string> {
  const keys = new Set<string>();
  for (const record of records) {
    keys.add(chartVersionKey(record.songId, record.type, record.levelIndex));
  }
  return keys;
}

export function filterRandomCharts(
  catalog: CatalogSnapshot,
  records: readonly ScoreRecord[],
  filters: RandomChartFilters,
): RandomChartPick[] {
  const playedKeys = buildPlayedKeys(records);
  const difficultySet = new Set(filters.difficulties);
  const requireDifficulty = difficultySet.size > 0;
  const picks: RandomChartPick[] = [];

  for (const song of catalog.songs) {
    const songId = normalizeSongId(song.id);
    for (const chart of song.charts) {
      if (requireDifficulty && !difficultySet.has(chart.difficulty)) continue;
      if (!matchesConstantRange(chart.difficultyConstant, filters.constantMin, filters.constantMax)) continue;
      const key = chartVersionKey(chart.songId, chart.type, chart.levelIndex);
      const played = playedKeys.has(key);
      if (filters.played === 'played' && !played) continue;
      if (filters.played === 'unplayed' && played) continue;
      picks.push({
        songId,
        title: song.title,
        artist: song.artist,
        type: chart.type,
        difficulty: chart.difficulty,
        levelIndex: chart.levelIndex,
        difficultyConstant: chart.difficultyConstant,
        played,
      });
    }
  }

  return picks;
}

export function pickRandomCharts(input: PickRandomChartsInput): RandomChartPick[] {
  const pool = [...filterRandomCharts(input.catalog, input.records, input.filters)];
  const count = Math.min(clampCount(input.count), pool.length);
  if (count === 0) return [];

  const random = createRng(input.seed);
  const picked: RandomChartPick[] = [];
  for (let index = 0; index < count; index += 1) {
    const choice = Math.floor(random() * pool.length);
    picked.push(pool[choice]!);
    pool.splice(choice, 1);
  }
  return picked;
}

export function chartPickKey(pick: RandomChartPick): string {
  return chartVersionKey(pick.songId, pick.type, pick.levelIndex);
}
