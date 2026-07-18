import type { CatalogSnapshot, ChartType, Difficulty, ScoreRecord } from './models';

const DIFFICULTIES: Difficulty[] = ['basic', 'advanced', 'expert', 'master', 'remaster'];

export function normalizeSongId(songId: string | number): string {
  const numericId = Number(songId);
  if (!Number.isSafeInteger(numericId) || numericId < 0) return String(songId);
  if (numericId > 100000) return String(numericId);
  if (numericId > 10000) return String(numericId % 10000);
  return String(numericId);
}

export function isUtageSongId(songId: string | number): boolean {
  const numericId = Number(songId);
  return Number.isSafeInteger(numericId) && numericId > 100000;
}

export function chartVersionKey(songId: string | number, type: ChartType, levelIndex: number): string {
  return `${normalizeSongId(songId)}:${type}:${levelIndex}`;
}

export function difficultyFromIndex(levelIndex: number): Difficulty {
  return DIFFICULTIES[levelIndex] ?? 'unknown';
}

export function enrichRecordsWithCatalog(
  records: readonly ScoreRecord[],
  catalog: CatalogSnapshot,
): ScoreRecord[] {
  const versionTitles = new Map(catalog.versions.map((version) => [version.id, version.title]));
  const songsById = new Map(catalog.songs.map((song) => [normalizeSongId(song.id), song]));
  return records.map((record) => {
    const song = songsById.get(normalizeSongId(record.songId));
    const chart = song?.charts.find(
      (item) => item.type === record.type && item.levelIndex === record.levelIndex,
    );
    const versionId = catalog.chartVersionIndex[chartVersionKey(record.songId, record.type, record.levelIndex)];
    return {
      ...record,
      difficultyConstant: chart?.difficultyConstant ?? record.difficultyConstant,
      notes: chart?.notes ?? record.notes,
      version: versionId === undefined
        ? 'unknown'
        : versionTitles.get(versionId) ?? String(versionId),
    };
  });
}
