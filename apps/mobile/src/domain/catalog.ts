import type { CatalogSnapshot, ChartType, Difficulty, ScoreRecord } from './models';

const DIFFICULTIES: Difficulty[] = ['basic', 'advanced', 'expert', 'master', 'remaster'];

export function normalizeSongId(songId: string | number): string {
  const numericId = Number(songId);
  if (!Number.isSafeInteger(numericId) || numericId < 0) return String(songId);
  if (numericId > 100000) return String(numericId);
  if (numericId > 10000) return String(numericId % 10000);
  return String(numericId);
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
  return records.map((record) => {
    const versionId = catalog.chartVersionIndex[chartVersionKey(record.songId, record.type, record.levelIndex)];
    return versionId === undefined
      ? { ...record, version: 'unknown' }
      : { ...record, version: versionTitles.get(versionId) ?? String(versionId) };
  });
}
