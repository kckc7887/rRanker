import type { ScoreRecord, Song } from '@/domain/models';
import { matchesAchievementRange } from '@/domain/maimai-filters';
import {
  matchesPhigrosLevel,
  matchesPhigrosRankFilter,
  matchesPhigrosScoreRange,
  phigrosLevelLabel,
  phigrosRankFilterLabel,
  type PhigrosRankFilter,
} from '@/domain/phigros-filters';
import type { PhigrosLevel } from '@/domain/phigros';
import {
  matchesPhigrosXingFilter,
  phigrosChartNoteKey,
  phigrosXingLabel,
  type PhigrosXingKind,
} from '@/domain/phigros-xing';
import { parseBestImageQuantity } from '@/features/best-image/best-image-custom';
import {
  sortPhigrosBestImageRecords,
  type PhigrosBestImageSection,
} from '@/features/phigros-best-image/phigros-best-image';

export type CustomPhigrosBestImageFilters = {
  quantity: number;
  level: PhigrosLevel | 'all';
  scoreMin: string;
  scoreMax: string;
  accuracyMin: string;
  accuracyMax: string;
  rank: PhigrosRankFilter | null;
  /** null = 关闭 XING 筛选；good/miss 单选 */
  xing: PhigrosXingKind | null;
};

export const DEFAULT_CUSTOM_PHIGROS_BEST_IMAGE_FILTERS: CustomPhigrosBestImageFilters = {
  quantity: 30,
  level: 'all',
  scoreMin: '',
  scoreMax: '',
  accuracyMin: '',
  accuracyMax: '',
  rank: null,
  xing: null,
};

export { parseBestImageQuantity };

/** 从曲库建立 songId:levelIndex → 物量 total 查找表 */
export function buildPhigrosNoteTotalByKey(songs: readonly Song[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const song of songs) {
    for (const chart of song.charts ?? []) {
      const total = chart.notes?.total;
      if (typeof total === 'number' && Number.isInteger(total) && total > 0) {
        result[phigrosChartNoteKey(song.id, chart.levelIndex)] = total;
      }
    }
  }
  return result;
}

/** 空字符串视为合法（不限）；非空须为 0–100 的 Acc。 */
export function parsePhigrosBestImageAccuracyBound(value: string): number | null | undefined {
  const normalized = value.normalize('NFKC').trim().replace(',', '.');
  if (normalized.length === 0) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 ? parsed : null;
}

/** 空字符串视为合法（不限）；非空须为 0–1000000 的分数。 */
export function parsePhigrosBestImageScoreBound(value: string): number | null | undefined {
  const normalized = value.normalize('NFKC').trim().replace(',', '.');
  if (normalized.length === 0) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1_000_000 ? parsed : null;
}

export function isCustomPhigrosBestImageFiltersValid(input: {
  quantityText: string;
  scoreMin: string;
  scoreMax: string;
  accuracyMin: string;
  accuracyMax: string;
}): boolean {
  if (parseBestImageQuantity(input.quantityText) === null) return false;
  if (parsePhigrosBestImageScoreBound(input.scoreMin) === null) return false;
  if (parsePhigrosBestImageScoreBound(input.scoreMax) === null) return false;
  if (parsePhigrosBestImageAccuracyBound(input.accuracyMin) === null) return false;
  if (parsePhigrosBestImageAccuracyBound(input.accuracyMax) === null) return false;
  return true;
}

function normalizeBoundText(value: string): string {
  return value.normalize('NFKC').trim().replace(',', '.');
}

function formatScoreNote(scoreMin: string, scoreMax: string): string | undefined {
  const min = normalizeBoundText(scoreMin);
  const max = normalizeBoundText(scoreMax);
  if (!min && !max) return undefined;
  if (min && max) return `分数${min}-${max}`;
  if (min) return `分数≥${min}`;
  return `分数≤${max}`;
}

function formatAccNote(accuracyMin: string, accuracyMax: string): string | undefined {
  const min = normalizeBoundText(accuracyMin);
  const max = normalizeBoundText(accuracyMax);
  if (!min && !max) return undefined;
  if (min && max) return `Acc${min}-${max}%`;
  if (min) return `Acc≥${min}%`;
  return `Acc≤${max}%`;
}

/** 自定义分区主标题 + 分数/Acc 小字附注。XING 为顶层标签（如 XING-GOOD3），不套 Best。 */
export function buildCustomPhigrosSectionTitle(
  filters: CustomPhigrosBestImageFilters,
  count: number,
): { title: string; titleNote?: string } {
  const hasLevel = filters.level !== 'all';
  const hasRank = filters.rank !== null;
  let title: string;
  if (filters.xing) {
    const xing = phigrosXingLabel(filters.xing);
    if (hasLevel && hasRank) {
      title = `${xing} ${phigrosLevelLabel(filters.level)} ${phigrosRankFilterLabel(filters.rank)}${count}`;
    } else if (hasLevel) {
      title = `${xing} ${phigrosLevelLabel(filters.level)}${count}`;
    } else if (hasRank) {
      title = `${xing} ${phigrosRankFilterLabel(filters.rank)}${count}`;
    } else {
      title = `${xing}${count}`;
    }
  } else if (hasLevel && hasRank) {
    title = `${phigrosLevelLabel(filters.level)} ${phigrosRankFilterLabel(filters.rank)}${count}`;
  } else if (hasLevel) {
    title = `${phigrosLevelLabel(filters.level)}${count}`;
  } else if (hasRank) {
    title = `${phigrosRankFilterLabel(filters.rank)}${count}`;
  } else {
    title = `Best${count}`;
  }
  const noteParts = [
    formatScoreNote(filters.scoreMin, filters.scoreMax),
    formatAccNote(filters.accuracyMin, filters.accuracyMax),
  ].filter((part): part is string => Boolean(part));
  return noteParts.length ? { title, titleNote: noteParts.join(' ') } : { title };
}

export function buildCustomPhigrosBestImageSections(
  records: readonly ScoreRecord[],
  filters: CustomPhigrosBestImageFilters,
  noteTotalByKey: Readonly<Record<string, number>> = {},
): PhigrosBestImageSection[] {
  const filtered = records.filter((record) => (
    matchesPhigrosLevel(record.levelIndex, filters.level)
    && matchesPhigrosScoreRange(record.dxScore, filters.scoreMin, filters.scoreMax)
    && matchesAchievementRange(record.achievements, filters.accuracyMin, filters.accuracyMax)
    && matchesPhigrosRankFilter(record, filters.rank)
    && matchesPhigrosXingFilter(record, filters.xing, noteTotalByKey)
  ));
  const sorted = sortPhigrosBestImageRecords(filtered);
  const limited = filters.quantity === 0 ? sorted : sorted.slice(0, filters.quantity);
  const { title, titleNote } = buildCustomPhigrosSectionTitle(filters, limited.length);
  return [{
    id: 'custom',
    title,
    ...(titleNote ? { titleNote } : {}),
    records: limited,
  }];
}
