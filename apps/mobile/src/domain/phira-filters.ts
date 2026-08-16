import type { PhigrosRankFilter } from './phigros-filters';
import type { PhigrosXingKind } from './phigros-xing';
import { phiraGrade, type PhiraChart, type PhiraChartPage, type PhiraQueriedBest } from './phira';
import { normalizeNumericInput } from '@/utils/numeric-input';

export type PhiraScoreSort = 'score' | 'acc' | 'constant';
export type PhiraCatalogSort = 'updated' | 'constant-asc' | 'constant-desc' | 'name';

export type PhiraScoreFilters = {
  keyword: string;
  constantMin: string;
  constantMax: string;
  accuracyMin: string;
  accuracyMax: string;
  rank: PhigrosRankFilter | null;
  xing: PhigrosXingKind | null;
  sort: PhiraScoreSort;
};

function finiteBound(value: string): number | undefined {
  const normalized = normalizeNumericInput(value);
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export function matchesPhiraRange(value: number, minInput: string, maxInput: string): boolean {
  const min = finiteBound(minInput); const max = finiteBound(maxInput);
  if (Number.isNaN(min) || Number.isNaN(max)) return false;
  if (min !== undefined && max !== undefined && min > max) return false;
  return (min === undefined || value >= min) && (max === undefined || value <= max);
}

export function phiraRecordXing(item: PhiraQueriedBest): PhigrosXingKind | null {
  const record = item.record;
  if (!record) return null;
  if (record.good === 1 && record.bad === 0 && record.miss === 0) return 'good';
  if (!record.fullCombo && record.good === 0 && record.bad === 0 && record.miss === 1) return 'miss';
  return null;
}

export function filterPhiraBests(
  values: readonly PhiraQueriedBest[], filters: PhiraScoreFilters,
): PhiraQueriedBest[] {
  const keyword = filters.keyword.trim().toLocaleLowerCase();
  return values.filter((item) => {
    const record = item.record;
    if (!record) return false;
    const accuracy = Math.abs(record.accuracy) <= 1 ? record.accuracy * 100 : record.accuracy;
    if (keyword && !item.chart.name.toLocaleLowerCase().includes(keyword)) return false;
    if (!matchesPhiraRange(item.chart.difficulty, filters.constantMin, filters.constantMax)) return false;
    if (!matchesPhiraRange(accuracy, filters.accuracyMin, filters.accuracyMax)) return false;
    if (filters.rank && phiraGrade(record).toLocaleLowerCase() !== filters.rank) return false;
    if (filters.xing && phiraRecordXing(item) !== filters.xing) return false;
    return true;
  }).sort((a, b) => {
    if (filters.sort === 'acc') return b.record!.accuracy - a.record!.accuracy;
    if (filters.sort === 'constant') return b.chart.difficulty - a.chart.difficulty;
    return b.record!.score - a.record!.score;
  });
}

export function filterPhiraCharts(
  values: readonly PhiraChart[], constantMin: string, constantMax: string, sort: PhiraCatalogSort,
): PhiraChart[] {
  return values.filter((chart) => matchesPhiraRange(chart.difficulty, constantMin, constantMax)).sort((a, b) => {
    if (sort === 'constant-asc') return a.difficulty - b.difficulty;
    if (sort === 'constant-desc') return b.difficulty - a.difficulty;
    if (sort === 'name') return a.name.localeCompare(b.name);
    return Date.parse(b.updated ?? '') - Date.parse(a.updated ?? '');
  });
}

/** Phira 曲库按 id 去重保序：服务端 page=1 返回与 page=0 相同的首页，且 updated 排序在请求间漂移会造成跨页重叠。 */
export function dedupePhiraCharts(values: readonly PhiraChart[]): PhiraChart[] {
  const seen = new Set<number>();
  return values.filter((chart) => {
    if (seen.has(chart.id)) return false;
    seen.add(chart.id);
    return true;
  });
}

/**
 * Phira /chart 分页下一页参数：
 * 服务端 page 从 1 开始且 page<1 会钳制为 1（实测所有 type：page=1 与 page=0 返回完全相同的首页），
 * 因此首页用 0（沿用既有缓存键），后续翻页跳过 1：0 → 2 → 3 → …。
 */
export function phiraCatalogNextPage(
  pages: readonly PhiraChartPage[],
  last: PhiraChartPage | undefined,
): number | undefined {
  const loaded = pages.reduce((sum, page) => sum + page.results.length, 0);
  const hasMore = last?.total !== undefined
    ? loaded < last.total
    : (last?.results.length ?? 0) >= 30;
  if (!hasMore) return undefined;
  return pages.length === 1 ? 2 : pages.length + 1;
}
