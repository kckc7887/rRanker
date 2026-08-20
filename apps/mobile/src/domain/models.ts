export type ChartType = 'SD' | 'DX' | 'UTAGE';
export type Difficulty =
  | 'basic'
  | 'advanced'
  | 'expert'
  | 'master'
  | 'remaster'
  | 'utage'
  | 'unknown';
export type DataSourceKind = 'fixture' | 'diving-fish' | 'lxns' | 'dxrating' | 'kyou' | 'tuf' | 'musedash' | 'phira' | 'osu' | 'local' | 'generated' | 'cache';

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
  /** 水鱼原始兼容字段；新消费端应优先读取 extension.courseRank。 */
  additionalRating?: number;
  extension?: {
    kind: 'maimai';
    /** 已归一化为舞萌/LXNS 段位素材编号。 */
    courseRank?: number;
  };
  presentation?: {
    iconId?: number;
    namePlateId?: number;
    frameId?: number;
    trophyName?: string;
    trophyColor?: string | null;
  };
  source: DataSource;
}

export interface Song {
  id: string;
  title: string;
  artist?: string;
  illustrator?: string;
  version: string;
  versionId?: number;
  bpm?: number;
  genre?: string;
  region?: string;
  rights?: string;
  aliases?: string[];
  locked?: boolean;
  disabled?: boolean;
  charts: Chart[];
}

export interface ChartNotes {
  tap: number;
  hold: number;
  slide: number;
  touch: number;
  break: number;
  total: number;
}

export interface BuddyChartNotes {
  left: ChartNotes;
  right: ChartNotes;
  /** 物量总计必须分别从 left/right 读取，禁止误当成单人谱面。 */
  total?: never;
}

export interface UtageChartMetadata {
  kanji?: string;
  description?: string;
  isBuddy: boolean;
}

/** Phigros 谱面物量：[Tap, Hold, Drag, Flick] */
export interface PhigrosChartNotes {
  tap: number;
  hold: number;
  drag: number;
  flick: number;
  total: number;
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
  charter?: string;
  versionId?: number;
  notes?: ChartNotes | BuddyChartNotes | PhigrosChartNotes;
  utage?: UtageChartMetadata;
}

export interface SongAlias {
  songId: string;
  aliases: string[];
}

export interface AliasSnapshot {
  aliases: SongAlias[];
  source: DataSource;
}

export interface PlateRequirement {
  difficulties: number[];
  rate?: string | null;
  fc?: string | null;
  fs?: string | null;
  songs: string[];
  songTypes?: Record<string, ChartType>;
}

export interface Plate {
  id: number;
  name: string;
  description?: string;
  requirements: PlateRequirement[];
}

export interface PlateSnapshot {
  plates: Plate[];
  source: DataSource;
}

export type CollectionKind = 'trophy' | 'icon' | 'plate' | 'frame';

export interface CollectionItem {
  id: number;
  kind: CollectionKind;
  name: string;
  description?: string;
  color?: string | null;
  genre?: string | null;
  requirements: PlateRequirement[];
}

export interface CollectionSnapshot {
  items: CollectionItem[];
  source: DataSource;
}

export interface SourceStatusItem {
  key: 'scores' | 'catalog' | 'detail' | 'aliases' | 'plates' | 'collections'
    | 'collection-trophy' | 'collection-character' | 'collection-plate' | 'collection-icon'
    | 'dxrating-tags' | 'phigros-kyou-tags' | 'notes' | 'bests' | 'musedash-albums';
  label: string;
  updatedAt?: string;
  state: 'live' | 'cache' | 'unavailable';
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
