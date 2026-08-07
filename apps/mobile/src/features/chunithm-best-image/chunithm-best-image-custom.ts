import type { ChunithmLevelIndex } from '@/domain/chunithm';
import { matchesChunithmConstantRange, matchesChunithmRankRange } from '@/domain/chunithm-filters';
import {
  compareChunithmScores,
  type ChunithmRank,
  type ChunithmScoreCardData,
} from '@/domain/chunithm-score-presentation';
import { parseBestImageQuantity } from '@/features/best-image/best-image-custom';
import type { ChunithmBestImageSection } from './chunithm-best-image';

export type CustomChunithmBestImageFilters = {
  quantity: number;
  difficulty: ChunithmLevelIndex | 'all';
  /** String(GameVersion.id)，'all' 表示不限版本。 */
  version: string | 'all';
  constantMin: string;
  constantMax: string;
  rankMin: ChunithmRank | null;
  rankMax: ChunithmRank | null;
  /** 版本筛选生效时的展示标签（如「STAR」）；未缩窄版本时为空。 */
  versionConditionLabel: string | null;
  /** 版本以外生效筛选条件的展示标签（如难度/定数/评价）。 */
  conditionLabels: readonly string[];
};

export const DEFAULT_CUSTOM_CHUNITHM_BEST_IMAGE_FILTERS: CustomChunithmBestImageFilters = {
  quantity: 50,
  difficulty: 'all',
  version: 'all',
  constantMin: '',
  constantMax: '',
  rankMin: null,
  rankMax: null,
  versionConditionLabel: null,
  conditionLabels: [],
};

export { parseBestImageQuantity };

/** 单个条件时标题为「{条件}N」，多个条件时标题为「自定义N」并附小字提示。 */
function buildSectionTitle(
  conditions: readonly string[],
  count: number,
): { title: string; subtitle?: string } {
  if (conditions.length === 0) return { title: `Best${count}` };
  if (conditions.length === 1) return { title: `${conditions[0]}${count}` };
  return { title: `自定义${count}`, subtitle: conditions.join(' · ') };
}

function matchesCustomChunithmFilters(
  record: ChunithmScoreCardData,
  filters: CustomChunithmBestImageFilters,
): boolean {
  if (filters.difficulty !== 'all' && record.levelIndex !== filters.difficulty) return false;
  if (filters.version !== 'all' && String(record.versionId) !== filters.version) return false;
  if (!matchesChunithmConstantRange(
    record.difficultyConstant,
    filters.constantMin,
    filters.constantMax,
  )) {
    return false;
  }
  return matchesChunithmRankRange(record.rank, filters.rankMin, filters.rankMax);
}

export function buildCustomChunithmBestImageSections(
  records: readonly ChunithmScoreCardData[],
  filters: CustomChunithmBestImageFilters,
): ChunithmBestImageSection[] {
  const filtered = records.filter((record) => matchesCustomChunithmFilters(record, filters));
  const sorted = [...filtered].sort(compareChunithmScores);
  const limited = filters.quantity === 0 ? sorted : sorted.slice(0, filters.quantity);
  const conditions = [filters.versionConditionLabel, ...filters.conditionLabels]
    .filter((label): label is string => label !== null);
  const { title, subtitle } = buildSectionTitle(conditions, limited.length);
  return [{
    id: 'custom',
    title,
    ...(subtitle ? { subtitle } : {}),
    records: limited,
  }];
}
