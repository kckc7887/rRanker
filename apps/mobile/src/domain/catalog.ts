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

export function originalSongIdForUtage(songId: string | number): string | undefined {
  const numericId = Number(songId);
  return Number.isSafeInteger(numericId) && numericId > 100000
    ? String(numericId % 10000)
    : undefined;
}

export function stripUtageTitlePrefix(title: string): string {
  return title.replace(/^\s*[\[［【][^\]］】]+[\]］】]\s*/u, '');
}

export function aliasesForCatalogSong(
  songId: string,
  aliases: ReadonlyMap<string, string[]>,
): string[] {
  const originalSongId = originalSongIdForUtage(songId);
  if (!originalSongId) return [...(aliases.get(songId) ?? [])];
  return [...(aliases.get(originalSongId) ?? aliases.get(normalizeSongId(originalSongId)) ?? [])];
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
      title: record.type === 'UTAGE' && song ? song.title : record.title,
      level: chart?.level ?? record.level,
      difficulty: chart?.difficulty ?? record.difficulty,
      difficultyConstant: chart?.difficultyConstant ?? record.difficultyConstant,
      charter: chart?.charter ?? record.charter,
      notes: chart?.notes ?? record.notes,
      utage: chart?.utage ?? record.utage,
      version: versionId === undefined
        ? 'unknown'
        : versionTitles.get(versionId) ?? String(versionId),
    };
  });
}
