import { chartVersionKey, normalizeSongId } from './catalog';
import {
  buildDxRatingChartTagIndex,
  dxRatingChartHasAllTags,
  type DxRatingChartTagsSnapshot,
} from './dxrating-chart-tags';
import {
  matchesAchievementRange,
  matchesConstantRange,
  matchesMultiAchievementFilter,
  matchesSoloAchievementFilter,
  parseAchievementBound,
  type MaimaiFcAchievement,
  type MaimaiFsAchievement,
} from './maimai-filters';
import type { CatalogSnapshot, ChartType, Difficulty, ScoreRecord } from './models';
import {
  matchesPhigrosLevel,
  matchesPhigrosRankFilter,
  type PhigrosRankFilter,
} from './phigros-filters';
import type { PhigrosLevel } from './phigros';
import {
  matchesPhigrosXingFilter,
  type PhigrosXingKind,
} from './phigros-xing';

export type RandomChartsCount = 1 | 2 | 3 | 4;

export type MaimaiRandomChartFilters = {
  difficulty: Difficulty | 'all';
  version: string | 'all';
  type: ChartType | 'all';
  constantMin: string;
  constantMax: string;
  achievementMin: string;
  achievementMax: string;
  soloAchievement: MaimaiFcAchievement | null;
  multiAchievement: MaimaiFsAchievement | null;
  selectedDxRatingTagIds: number[];
};

export type PhigrosRandomChartFilters = {
  level: PhigrosLevel | 'all';
  constantMin: string;
  constantMax: string;
  accuracyMin: string;
  accuracyMax: string;
  rank: PhigrosRankFilter | null;
  xing: PhigrosXingKind | null;
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

/** Generic deterministic sampling without replacement; game-specific data stays outside this contract. */
export function pickRandomItems<T>(
  items: readonly T[],
  count: number,
  seed: string,
): T[] {
  const pool = [...items];
  const size = Math.min(clampCount(count), pool.length);
  if (size === 0) return [];

  const random = createRng(seed);
  const picked: T[] = [];
  for (let index = 0; index < size; index += 1) {
    const choice = Math.floor(random() * pool.length);
    picked.push(pool[choice]!);
    pool.splice(choice, 1);
  }
  return picked;
}

export function buildBestRecordMap(
  records: readonly ScoreRecord[],
): Map<string, ScoreRecord> {
  const best = new Map<string, ScoreRecord>();
  for (const record of records) {
    const key = chartVersionKey(record.songId, record.type, record.levelIndex);
    const current = best.get(key);
    if (!current || record.achievements > current.achievements) best.set(key, record);
  }
  return best;
}

function hasValidAchievementRange(minInput: string, maxInput: string): boolean {
  return parseAchievementBound(minInput) !== undefined
    || parseAchievementBound(maxInput) !== undefined;
}

export function filterMaimaiRandomCharts(
  catalog: CatalogSnapshot,
  records: readonly ScoreRecord[],
  filters: MaimaiRandomChartFilters,
  tags?: DxRatingChartTagsSnapshot,
): RandomChartPick[] {
  const bestByChart = buildBestRecordMap(records);
  const versionTitleById = new Map(catalog.versions.map((version) => [version.id, version.title]));
  const scoreFilterActive = hasValidAchievementRange(
    filters.achievementMin,
    filters.achievementMax,
  ) || filters.soloAchievement !== null || filters.multiAchievement !== null;
  const hasConstantFilter = !!(filters.constantMin || filters.constantMax);
  const tagFilterActive = tags !== undefined && filters.selectedDxRatingTagIds.length > 0;
  const tagIndex = tagFilterActive ? buildDxRatingChartTagIndex(tags, catalog.songs) : new Map();
  const picks: RandomChartPick[] = [];

  for (const song of catalog.songs) {
    const songId = normalizeSongId(song.id);
    for (const chart of song.charts) {
      if (filters.difficulty !== 'all' && chart.difficulty !== filters.difficulty) continue;
      if (filters.type !== 'all' && chart.type !== filters.type) continue;
      const chartVersion = chart.versionId === undefined
        ? song.version
        : versionTitleById.get(chart.versionId) ?? String(chart.versionId);
      if (filters.version !== 'all' && chartVersion !== filters.version) continue;
      if (chart.type === 'UTAGE' && hasConstantFilter) continue;
      if (!matchesConstantRange(
        chart.difficultyConstant,
        filters.constantMin,
        filters.constantMax,
      )) continue;
      if (tagFilterActive && !dxRatingChartHasAllTags(
        tagIndex,
        chart.songId,
        chart.type,
        chart.levelIndex,
        filters.selectedDxRatingTagIds,
      )) continue;

      const key = chartVersionKey(chart.songId, chart.type, chart.levelIndex);
      const record = bestByChart.get(key);
      if (scoreFilterActive && !record) continue;
      if (record && !matchesAchievementRange(
        record.achievements,
        filters.achievementMin,
        filters.achievementMax,
      )) continue;
      if (record && !matchesSoloAchievementFilter(record, filters.soloAchievement)) continue;
      if (record && !matchesMultiAchievementFilter(record, filters.multiAchievement)) continue;

      picks.push({
        songId,
        title: song.title,
        artist: song.artist,
        type: chart.type,
        difficulty: chart.difficulty,
        levelIndex: chart.levelIndex,
        difficultyConstant: chart.difficultyConstant,
        played: record !== undefined,
      });
    }
  }
  return picks;
}

export function filterPhigrosRandomCharts(
  catalog: CatalogSnapshot,
  records: readonly ScoreRecord[],
  filters: PhigrosRandomChartFilters,
  noteTotalByKey: Readonly<Record<string, number>>,
): RandomChartPick[] {
  const bestByChart = buildBestRecordMap(records);
  const scoreFilterActive = hasValidAchievementRange(
    filters.accuracyMin,
    filters.accuracyMax,
  ) || filters.rank !== null || filters.xing !== null;
  const picks: RandomChartPick[] = [];

  for (const song of catalog.songs) {
    const songId = normalizeSongId(song.id);
    for (const chart of song.charts) {
      if (!matchesPhigrosLevel(chart.levelIndex, filters.level)) continue;
      if (!matchesConstantRange(
        chart.difficultyConstant,
        filters.constantMin,
        filters.constantMax,
      )) continue;

      const key = chartVersionKey(chart.songId, chart.type, chart.levelIndex);
      const record = bestByChart.get(key);
      if (scoreFilterActive && !record) continue;
      if (record && !matchesAchievementRange(
        record.achievements,
        filters.accuracyMin,
        filters.accuracyMax,
      )) continue;
      if (record && !matchesPhigrosRankFilter(record, filters.rank)) continue;
      if (record && !matchesPhigrosXingFilter(record, filters.xing, noteTotalByKey)) continue;

      picks.push({
        songId,
        title: song.title,
        artist: song.artist,
        type: chart.type,
        difficulty: chart.difficulty,
        levelIndex: chart.levelIndex,
        difficultyConstant: chart.difficultyConstant,
        played: record !== undefined,
      });
    }
  }
  return picks;
}

export function chartPickKey(pick: RandomChartPick): string {
  return chartVersionKey(pick.songId, pick.type, pick.levelIndex);
}
