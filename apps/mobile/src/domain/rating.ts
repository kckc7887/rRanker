import type { Best50Snapshot, DataSource, Player, ScoreRecord } from './models';

const RATING_COEFFICIENTS: readonly [number, number][] = [
  [50, 7], [60, 8], [70, 9.6], [75, 11.2], [80, 12], [90, 13.6],
  [94, 15.2], [97, 16.8], [98, 20], [99, 20.3], [99.5, 20.8],
  [100, 21.1], [100.5, 21.6], [Number.POSITIVE_INFINITY, 22.4],
];

export function calculateChartRating(difficultyConstant: number, achievements: number): number {
  const coefficient = RATING_COEFFICIENTS.find(([threshold]) => achievements < threshold)?.[1] ?? 22.4;
  const cappedAchievement = Math.min(100.5, Math.max(0, achievements));
  return Math.floor(difficultyConstant * (cappedAchievement / 100) * coefficient);
}

function rankRecords(records: readonly ScoreRecord[]): ScoreRecord[] {
  return [...records].sort(
    (left, right) => right.rating - left.rating || right.achievements - left.achievements ||
      left.songId.localeCompare(right.songId) || left.levelIndex - right.levelIndex,
  );
}

export function buildBest50(
  player: Player,
  records: readonly ScoreRecord[],
  currentVersion: string,
  source: DataSource,
  generatedAt = new Date().toISOString(),
): Best50Snapshot {
  if (!currentVersion.trim()) throw new Error('currentVersion must come from a verified music-data contract');
  const b35 = rankRecords(records.filter((record) => record.version !== 'unknown' && record.version !== currentVersion)).slice(0, 35);
  const b15 = rankRecords(records.filter((record) => record.version === currentVersion)).slice(0, 15);
  return {
    player, currentVersion, b35, b15,
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
