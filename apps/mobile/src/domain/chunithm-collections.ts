import type { ChunithmScore } from './chunithm-personal';
import { chunithmRankFromScore } from './chunithm-score-presentation';
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
};

/**
 * 收藏品达成条件（lxns 中二 Collection.required 的归一化形态）。
 * 与舞萌的 PlateRequirement 不同：中二使用 rank / full_combo / full_chain，
 * 曲目只有 id 与标题，完成状态由本地成绩快照计算。
 */
export type ChunithmCollectionRequired = {
  difficulties: number[];
  rank?: ChunithmRankType;
  fullCombo?: ChunithmFullComboType;
  fullChain?: ChunithmFullChainType;
  clear?: string;
  songs: ChunithmCollectionRequiredSong[];
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

export const CHUNITHM_COLLECTION_LIST_RESOURCE_KEY = 'chunithm-collections';
export const CHUNITHM_COLLECTION_LIST_SCHEMA_VERSION = 1;

export function isChunithmCollectionKind(value: string | undefined): value is ChunithmCollectionKind {
  return value === 'trophy' || value === 'character' || value === 'plate' || value === 'icon';
}

/** 是否“条件可自动计算”（拥有结构化 required 且至少包含一首曲目）。 */
export function isChunithmCollectionComputable(collection: ChunithmCollection): boolean {
  return Boolean(
    collection.required?.length
    && collection.required.some((group) => group.songs.length > 0),
  );
}

const RANK_ORDER = [
  'd', 'c', 'b', 'bb', 'bbb', 'a', 'aa', 'aaa', 's', 'sp', 'ss', 'ssp', 'sss', 'sssp',
];
const FULL_COMBO_ORDER = ['fullcombo', 'alljustice', 'alljusticecritical'];
const FULL_CHAIN_ORDER = ['fullchain', 'fullchain2'];

/** chunithmRankFromScore 的显示标签 → lxns 原始枚举值。 */
const RANK_DISPLAY_TO_RAW: Record<string, string> = {
  'D': 'd', 'C': 'c', 'B': 'b', 'BB': 'bb', 'BBB': 'bbb',
  'A': 'a', 'AA': 'aa', 'AAA': 'aaa',
  'S': 's', 'S+': 'sp', 'SS': 'ss', 'SS+': 'ssp', 'SSS': 'sss', 'SSS+': 'sssp',
};

function meets(value: string | null | undefined, required: string | undefined, order: string[]): boolean {
  if (!required) return true;
  if (!value) return false;
  const actual = order.indexOf(value.toLowerCase());
  const minimum = order.indexOf(required.toLowerCase());
  return minimum >= 0 && actual >= minimum;
}

/** 单条成绩是否满足条件组：难度之外的门槛（评级/全连/全链）全部达标。 */
export function chunithmScoreMeetsRequirement(
  score: ChunithmScore,
  required: ChunithmCollectionRequired,
): boolean {
  const rawRank = score.rank ?? RANK_DISPLAY_TO_RAW[chunithmRankFromScore(score.score)];
  return meets(rawRank, required.rank, RANK_ORDER)
    && meets(score.full_combo, required.fullCombo, FULL_COMBO_ORDER)
    && meets(score.full_chain, required.fullChain, FULL_CHAIN_ORDER);
}

export interface ChunithmMissingSongProgress {
  songId: string;
  missingDifficulties: number[];
}

export interface ChunithmCollectionProgress {
  /** 要求谱面总数（按难度逐项计）。 */
  total: number;
  /** 已完成谱面数。 */
  completed: number;
  completedSongIds: string[];
  missingSongIds: string[];
  missingSongs: ChunithmMissingSongProgress[];
  byDifficulty: Record<number, { total: number; completed: number }>;
}

/**
 * 用玩家成绩快照计算收藏品进度（与舞萌 calculatePlateProgress 同构）：
 * 每组条件按曲目逐难度核对，难度数组为空表示任意难度。
 */
export function calculateChunithmCollectionProgress(
  collection: ChunithmCollection,
  scores: readonly ChunithmScore[],
): ChunithmCollectionProgress {
  const requirementsBySong = new Map<string, ChunithmCollectionRequired[]>();
  (collection.required ?? []).forEach((requirement) => {
    requirement.songs.forEach((song) => {
      const id = String(song.id);
      requirementsBySong.set(id, [...(requirementsBySong.get(id) ?? []), requirement]);
    });
  });

  const recordsBySong = new Map<string, ChunithmScore[]>();
  for (const score of scores) {
    const id = String(score.id);
    recordsBySong.set(id, [...(recordsBySong.get(id) ?? []), score]);
  }

  const completedSongIds: string[] = [];
  const missingSongs: ChunithmMissingSongProgress[] = [];
  const byDifficulty: Record<number, { total: number; completed: number }> = {};

  requirementsBySong.forEach((requirements, songId) => {
    const songRecords = recordsBySong.get(songId) ?? [];
    const unmet = new Set<number>();
    for (const requirement of requirements) {
      if (requirement.difficulties.length === 0) {
        if (!songRecords.some((record) => chunithmScoreMeetsRequirement(record, requirement))) {
          unmet.add(-1);
        }
      } else {
        for (const difficulty of requirement.difficulties) {
          const ok = songRecords.some((record) =>
            record.level_index === difficulty && chunithmScoreMeetsRequirement(record, requirement));
          if (!ok) unmet.add(difficulty);
        }
      }
    }
    const sortedUnmet = [...unmet].sort((left, right) => left - right);
    if (sortedUnmet.length === 0) completedSongIds.push(songId);
    else missingSongs.push({ songId, missingDifficulties: sortedUnmet });
    const requiredDifficulties = new Set(requirements.flatMap((item) =>
      item.difficulties.length ? item.difficulties : [-1]));
    requiredDifficulties.forEach((difficulty) => {
      byDifficulty[difficulty] ??= { total: 0, completed: 0 };
      byDifficulty[difficulty].total += 1;
      if (!sortedUnmet.includes(difficulty)) byDifficulty[difficulty].completed += 1;
    });
  });

  const chartTotals = Object.values(byDifficulty);
  return {
    total: chartTotals.reduce((sum, item) => sum + item.total, 0),
    completed: chartTotals.reduce((sum, item) => sum + item.completed, 0),
    completedSongIds,
    missingSongIds: missingSongs.map((item) => item.songId),
    missingSongs,
    byDifficulty,
  };
}
