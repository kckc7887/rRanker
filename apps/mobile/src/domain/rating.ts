import { chartVersionKey } from './catalog';
import type { Best50Snapshot, CatalogSnapshot, DataSource, Player, ScoreRecord } from './models';

const RATING_COEFFICIENTS: readonly [number, number][] = [
  [10, 0], [20, 1.6], [30, 3.2], [40, 4.8], [50, 6.4], [60, 8],
  [70, 9.6], [75, 11.2], [79.9999, 12], [80, 12.8], [90, 13.6],
  [94, 15.2], [96.9999, 16.8], [97, 17.6], [98, 20], [98.9999, 20.3],
  [99, 20.6], [99.5, 20.8], [99.9999, 21.1], [100, 21.4],
  [100.4999, 21.6], [100.5, 22.2], [Number.POSITIVE_INFINITY, 22.4],
];

export function calculateChartRating(difficultyConstant: number, achievements: number): number {
  const coefficient = RATING_COEFFICIENTS.find(([threshold]) => achievements < threshold)?.[1] ?? 22.4;
  const cappedAchievement = Math.min(100.5, Math.max(0, achievements));
  return Math.floor(difficultyConstant * (cappedAchievement / 100) * coefficient);
}

export function ratingTable(difficultyConstant: number): { achievement: number; rating: number }[] {
  return RATING_COEFFICIENTS.filter(([achievement]) => Number.isFinite(achievement))
    .map(([achievement]) => ({ achievement, rating: calculateChartRating(difficultyConstant, achievement) }));
}

export function ratingTableDescending(difficultyConstant: number): { achievement: number; rating: number }[] {
  return ratingTable(difficultyConstant).reverse();
}

export function minimumAchievementForRating(difficultyConstant: number, targetRating: number): number | null {
  if (!Number.isFinite(difficultyConstant) || difficultyConstant <= 0 || !Number.isInteger(targetRating) || targetRating < 0) return null;
  if (calculateChartRating(difficultyConstant, 101) < targetRating) return null;
  let low = 0;
  let high = 1_010_000;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (calculateChartRating(difficultyConstant, middle / 10_000) >= targetRating) high = middle;
    else low = middle + 1;
  }
  return low / 10_000;
}

export function rankScoreRecords(records: readonly ScoreRecord[]): ScoreRecord[] {
  return [...records].sort(
    (left, right) => right.rating - left.rating || right.achievements - left.achievements ||
      left.songId.localeCompare(right.songId) || left.levelIndex - right.levelIndex,
  );
}

export function buildBest50(
  player: Player,
  records: readonly ScoreRecord[],
  catalog: CatalogSnapshot,
  source: DataSource,
  generatedAt = new Date().toISOString(),
): Best50Snapshot {
  const classified = records.map((record) => ({
    record,
    version: catalog.chartVersionIndex[chartVersionKey(record.songId, record.type, record.levelIndex)],
  }));
  const unmatchedRecordCount = classified.filter(({ version }) => version === undefined).length;
  const b35 = rankScoreRecords(classified
    .filter(({ version }) => version !== undefined && version !== catalog.currentVersion.id)
    .map(({ record }) => record)).slice(0, 35);
  const b15 = rankScoreRecords(classified
    .filter(({ version }) => version === catalog.currentVersion.id)
    .map(({ record }) => record)).slice(0, 15);
  return {
    player, currentVersion: catalog.currentVersion, b35, b15, unmatchedRecordCount,
    rating: [...b35, ...b15].reduce((total, record) => total + record.rating, 0),
    generatedAt, source,
  };
}

export function mapCoverId(songId: number): number {
  if (songId >= 110000) return songId - 110000;
  if (songId >= 100000) return songId - 100000;
  if (songId >= 10001 && songId <= 19999) return songId - 10000;
  return songId;
}
