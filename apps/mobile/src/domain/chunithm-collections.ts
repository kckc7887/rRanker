import type { DataSource } from './models';

export type ChunithmCollectionKind = 'trophy' | 'character' | 'plate' | 'icon';

export const CHUNITHM_COLLECTION_KINDS: readonly ChunithmCollectionKind[] = [
  'trophy',
  'character',
  'plate',
  'icon',
];

export const CHUNITHM_COLLECTION_KIND_LABELS: Record<ChunithmCollectionKind, string> = {
  trophy: '称号',
  character: '角色',
  plate: '名牌版',
  icon: '地图头像',
};

export type ChunithmRankType =
  | 'sssp' | 'sss' | 'ssp' | 'ss' | 'sp' | 's'
  | 'aaa' | 'aa' | 'a' | 'bbb' | 'bb' | 'b' | 'c' | 'd';

export type ChunithmFullComboType = 'alljusticecritical' | 'alljustice' | 'fullcombo';

export type ChunithmFullChainType = 'fullchain' | 'fullchain2';

export type ChunithmCollectionRequiredSong = {
  id: number;
  title: string;
  completed?: boolean;
  completedDifficulties?: number[];
};

/**
 * 收藏品达成条件（lxns 中二 Collection.required 的归一化形态）。
 * 与舞萌的 PlateRequirement 不同：中二使用 rank / full_combo / full_chain，
 * 且曲目直接带 completed 状态（由落雪服务端按玩家成绩计算）。
 */
export type ChunithmCollectionRequired = {
  difficulties: number[];
  rank?: ChunithmRankType;
  fullCombo?: ChunithmFullComboType;
  fullChain?: ChunithmFullChainType;
  clear?: string;
  songs: ChunithmCollectionRequiredSong[];
  completed?: boolean;
};

export type ChunithmCollection = {
  id: number;
  name: string;
  description?: string;
  color?: string;
  level?: number;
  required?: ChunithmCollectionRequired[];
};

export type ChunithmCollectionListSnapshot = {
  items: ChunithmCollection[];
  source: DataSource;
};

export type ChunithmCollectionProgressSnapshot = {
  collection: ChunithmCollection;
  source: DataSource;
};

export const CHUNITHM_COLLECTION_LIST_RESOURCE_KEY = 'chunithm-collections';
export const CHUNITHM_COLLECTION_LIST_SCHEMA_VERSION = 1;

export function isChunithmCollectionKind(value: string | undefined): value is ChunithmCollectionKind {
  return value === 'trophy' || value === 'character' || value === 'plate' || value === 'icon';
}

/** 条件组统计：总条件组、已完成组、总曲目要求、已完成曲目数。 */
export function summarizeChunithmCollectionProgress(
  required: readonly ChunithmCollectionRequired[] | undefined,
): { groups: number; completedGroups: number; songRequirements: number; completedSongs: number } {
  if (!required?.length) {
    return { groups: 0, completedGroups: 0, songRequirements: 0, completedSongs: 0 };
  }
  let songRequirements = 0;
  let completedSongs = 0;
  for (const group of required) {
    songRequirements += group.songs.length;
    completedSongs += group.songs.filter((song) => song.completed).length;
  }
  return {
    groups: required.length,
    completedGroups: required.filter((group) => group.completed).length,
    songRequirements,
    completedSongs,
  };
}

/** 是否“条件可自动计算”（拥有结构化 required 且至少包含一首曲目）。 */
export function isChunithmCollectionComputable(collection: ChunithmCollection): boolean {
  return Boolean(
    collection.required?.length
    && collection.required.some((group) => group.songs.length > 0),
  );
}
