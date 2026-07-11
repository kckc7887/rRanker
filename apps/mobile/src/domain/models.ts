export type ChartType = 'SD' | 'DX';
export type Difficulty =
  | 'basic'
  | 'advanced'
  | 'expert'
  | 'master'
  | 'remaster'
  | 'unknown';
export type DataSourceKind = 'fixture' | 'diving-fish' | 'cache';

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
  currentVersion: string;
  b35: ScoreRecord[];
  b15: ScoreRecord[];
  rating: number;
  generatedAt: string;
  source: DataSource;
}

export interface ScoreSnapshot {
  player: Player;
  records: ScoreRecord[];
  best50: Best50Snapshot;
  source: DataSource;
}
