import type { DataSource, GameVersion } from './models';

export const CHUNITHM_CATALOG_RESOURCE_KEY = 'chunithm-catalog';
export const CHUNITHM_ALIAS_RESOURCE_KEY = 'chunithm-alias';
export const CHUNITHM_SONG_DETAIL_RESOURCE_PREFIX = 'chunithm-song-detail:';

export type ChunithmLevelIndex = 0 | 1 | 2 | 3 | 4 | 5;

export type ChunithmNotes = {
  total: number;
  tap: number;
  hold: number;
  slide: number;
  air: number;
  flick: number;
};

export type ChunithmDifficulty = {
  difficulty: ChunithmLevelIndex;
  level: string;
  levelValue: number;
  noteDesigner?: string;
  versionId: number;
  versionTitle: string;
  originId?: number;
  kanji?: string;
  star?: number;
  notes?: ChunithmNotes;
};

export type ChunithmSong = {
  id: number;
  title: string;
  artist?: string;
  genre: string;
  bpm: number;
  map?: string;
  rights?: string;
  aliases?: string[];
  versionId: number;
  versionTitle: string;
  locked: boolean;
  disabled: boolean;
  difficulties: ChunithmDifficulty[];
};

export type ChunithmGenre = {
  id: number;
  title: string;
};

export type ChunithmCatalogSnapshot = {
  currentVersion: GameVersion;
  versions: GameVersion[];
  genres: ChunithmGenre[];
  songs: ChunithmSong[];
  source: DataSource;
};

export type ChunithmSongDetailSnapshot = {
  song: ChunithmSong;
  source: DataSource;
};

export type ChunithmAlias = {
  songId: string;
  aliases: string[];
};

export type ChunithmAliasSnapshot = {
  aliases: ChunithmAlias[];
  source: DataSource;
};

export function chunithmAliasesForSong(
  songId: string | number,
  aliases: ReadonlyMap<string, string[]>,
): string[] {
  return [...(aliases.get(String(songId)) ?? [])];
}

export function chunithmSongDetailResourceKey(songId: string | number): string {
  return `${CHUNITHM_SONG_DETAIL_RESOURCE_PREFIX}${songId}`;
}

export const CHUNITHM_DIFFICULTY_LABELS: Record<ChunithmLevelIndex, string> = {
  0: 'BASIC',
  1: 'ADVANCED',
  2: 'EXPERT',
  3: 'MASTER',
  4: 'ULTIMA',
  5: "WORLD'S END",
};
