import type { ScoreRecord } from '@/domain/models';

export type PhigrosBestImageType = 'best30' | 'custom';
export type PhigrosBestImageDifficulty = 0 | 1 | 2 | 3;
export type PhigrosBestImageRate = 'phi' | 'v' | 's' | 'a' | 'b' | 'c' | 'f';

export type PhigrosBestImageFilters = {
  quantity: number;
  difficulties: PhigrosBestImageDifficulty[];
  minConstant: number | null;
  maxConstant: number | null;
  minAcc: number | null;
  maxAcc: number | null;
  rates: PhigrosBestImageRate[];
  fcOnly: boolean;
};

export const DEFAULT_PHIGROS_BEST_IMAGE_FILTERS: PhigrosBestImageFilters = {
  quantity: 30,
  difficulties: [0, 1, 2, 3],
  minConstant: null,
  maxConstant: null,
  minAcc: null,
  maxAcc: null,
  rates: [],
  fcOnly: false,
};

export type PhigrosBestImageSection = { id: string; title: string; records: ScoreRecord[] };
export type PhigrosBestImagePage = {
  id: string;
  pageIndex: number;
  pageCount: number;
  sections: PhigrosBestImageSection[];
};

export function parseOptionalRangeNumber(value: string, minimum: number, maximum: number): number | null | undefined {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) return undefined;
  return parsed;
}

export function parsePhigrosImageQuantity(value: string): number | null {
  if (!/^\d+$/u.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= 999 ? parsed : null;
}

function stableRksSort(records: readonly ScoreRecord[]): ScoreRecord[] {
  return records.map((record, index) => ({ record, index }))
    .sort((left, right) => right.record.rating - left.record.rating
      || right.record.achievements - left.record.achievements
      || left.index - right.index)
    .map(({ record }) => record);
}

export function buildPhigrosCustomRecords(
  records: readonly ScoreRecord[],
  filters: PhigrosBestImageFilters,
): ScoreRecord[] {
  const difficultySet = new Set(filters.difficulties);
  const rateSet = new Set(filters.rates);
  const filtered = records.filter((record) => {
    if (!difficultySet.has(record.levelIndex as PhigrosBestImageDifficulty)) return false;
    if (filters.minConstant != null && record.difficultyConstant < filters.minConstant) return false;
    if (filters.maxConstant != null && record.difficultyConstant > filters.maxConstant) return false;
    if (filters.minAcc != null && record.achievements < filters.minAcc) return false;
    if (filters.maxAcc != null && record.achievements > filters.maxAcc) return false;
    if (filters.fcOnly && !record.fc) return false;
    if (rateSet.size > 0 && !rateSet.has(record.rate as PhigrosBestImageRate)) return false;
    return true;
  });
  const sorted = stableRksSort(filtered);
  return filters.quantity === 0 ? sorted : sorted.slice(0, filters.quantity);
}

/** 每页最多 30 张，保持分区顺序与区内顺序。 */
export function paginatePhigrosBestImageSections(
  sections: readonly PhigrosBestImageSection[],
): PhigrosBestImagePage[] {
  const flat = sections.flatMap((section) => section.records.map((record) => ({ section, record })));
  const pageCount = Math.max(1, Math.ceil(flat.length / 30));
  return Array.from({ length: pageCount }, (_, pageIndex) => {
    const slice = flat.slice(pageIndex * 30, pageIndex * 30 + 30);
    const pageSections: PhigrosBestImageSection[] = [];
    for (const { section, record } of slice) {
      const last = pageSections.at(-1);
      if (last?.id === section.id) last.records.push(record);
      else pageSections.push({ id: section.id, title: section.title, records: [record] });
    }
    return { id: `phi-page-${pageIndex}`, pageIndex, pageCount, sections: pageSections };
  });
}
