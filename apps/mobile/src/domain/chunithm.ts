import type { DataSource, GameVersion } from './models';

export const CHUNITHM_CATALOG_RESOURCE_KEY = 'chunithm-catalog';

export type ChunithmLevelIndex = 0 | 1 | 2 | 3 | 4;

export type ChunithmDifficulty = {
  difficulty: ChunithmLevelIndex;
  level: string;
  levelValue: number;
  noteDesigner?: string;
  versionId: number;
  versionTitle: string;
};

export type ChunithmSong = {
  id: number;
  title: string;
  artist?: string;
  genre: string;
  bpm: number;
  map?: string;
  rights?: string;
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

export const CHUNITHM_DIFFICULTY_LABELS: Record<ChunithmLevelIndex, string> = {
  0: 'BASIC',
  1: 'ADVANCED',
  2: 'EXPERT',
  3: 'MASTER',
  4: 'ULTIMA',
};
