import type {
  ChunithmCatalogSnapshot,
  ChunithmDifficulty,
  ChunithmLevelIndex,
} from './chunithm';
import {
  matchesChunithmChartFilter,
  matchesChunithmRankRange,
} from './chunithm-filters';
import {
  formatChunithmWorldsEndLabel,
  type ChunithmRank,
  type ChunithmScoreCardData,
} from './chunithm-score-presentation';

export type ChunithmRandomChartFilters = {
  difficulty: ChunithmLevelIndex | 'all';
  version: string | 'all';
  constantMin: string;
  constantMax: string;
  rankMin: ChunithmRank | null;
  rankMax: ChunithmRank | null;
};

export type ChunithmRandomChartPick = {
  songId: string;
  title: string;
  artist?: string;
  levelIndex: ChunithmLevelIndex;
  level: string;
  difficultyConstant?: number;
  versionId: number;
  versionTitle: string;
  worldsEndLabel?: string;
  record?: ChunithmScoreCardData;
};

function chartKey(songId: string, levelIndex: number): string {
  return `${songId}-${levelIndex}`;
}

function toPick(
  song: ChunithmCatalogSnapshot['songs'][number],
  chart: ChunithmDifficulty,
  record: ChunithmScoreCardData | undefined,
): ChunithmRandomChartPick {
  const worldsEnd = chart.difficulty === 5;
  return {
    songId: String(song.id),
    title: song.title,
    artist: song.artist,
    levelIndex: chart.difficulty,
    level: chart.level,
    difficultyConstant: worldsEnd ? undefined : chart.levelValue,
    versionId: chart.versionId,
    versionTitle: chart.versionTitle,
    worldsEndLabel: worldsEnd
      ? formatChunithmWorldsEndLabel({
        kanji: chart.kanji,
        star: chart.star,
        scoreLevel: chart.level,
      })
      : undefined,
    record,
  };
}

export function filterChunithmRandomCharts(
  catalog: ChunithmCatalogSnapshot,
  records: readonly ChunithmScoreCardData[],
  filters: ChunithmRandomChartFilters,
): ChunithmRandomChartPick[] {
  const recordByChart = new Map(
    records.map((record) => [chartKey(record.songId, record.levelIndex), record]),
  );
  const scoreFilterActive = filters.rankMin !== null || filters.rankMax !== null;
  const picks: ChunithmRandomChartPick[] = [];

  for (const song of catalog.songs) {
    for (const chart of song.difficulties) {
      if (!matchesChunithmChartFilter(chart, filters)) continue;
      const record = recordByChart.get(chartKey(String(song.id), chart.difficulty));
      if (scoreFilterActive && !record) continue;
      if (record && !matchesChunithmRankRange(
        record.rank,
        filters.rankMin,
        filters.rankMax,
      )) continue;
      picks.push(toPick(song, chart, record));
    }
  }
  return picks;
}

export function chunithmRandomChartKey(pick: ChunithmRandomChartPick): string {
  return chartKey(pick.songId, pick.levelIndex);
}
