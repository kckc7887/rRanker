export type ChartType = 'SD' | 'DX';
export type Difficulty =
  | 'basic'
  | 'advanced'
  | 'expert'
  | 'master'
  | 'remaster'
  | 'unknown';
export type DataSourceKind = 'fixture' | 'diving-fish' | 'lxns' | 'cache';

export interface DataSource {
  kind: DataSourceKind;
  label: string;
  updatedAt: string;
  isStale: boolean;
}

export interface Player {
  id: string;
  displayName: string;
  rating: number;
  additionalRating?: number;
  source: DataSource;
}

export interface Song {
  id: string;
  title: string;
  artist?: string;
  version: string;
  charts: Chart[];
}

export interface GameVersion {
  id: number;
  title: string;
}

export interface CatalogSnapshot {
  currentVersion: GameVersion;
  versions: GameVersion[];
  songs: Song[];
  chartVersionIndex: Record<string, number>;
  source: DataSource;
}

export interface Chart {
  songId: string;
  type: ChartType;
  levelIndex: number;
  level: string;
  difficulty: Difficulty;
  difficultyConstant: number;
}

export interface ScoreRecord extends Chart {
  title: string;
  achievements: number;
  dxScore: number | null;
  rating: number;
  fc: string | null;
  fs: string | null;
  rate: string;
  version: string;
  rawDifficulty?: string;
  rawFc?: string;
  rawFs?: string;
  rawRate?: string;
}

export interface Best50Snapshot {
  player: Player;
  currentVersion: GameVersion;
  b35: ScoreRecord[];
  b15: ScoreRecord[];
  unmatchedRecordCount: number;
  rating: number;
  generatedAt: string;
  source: DataSource;
}

export interface ScoreSnapshot {
  player: Player;
  records: ScoreRecord[];
  best50: Best50Snapshot;
  source: DataSource;
  catalogSource: DataSource;
}
