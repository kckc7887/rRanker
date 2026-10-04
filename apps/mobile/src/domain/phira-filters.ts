import { PHIRA_RATE_LABELS, type PhiraRateKind, type PhiraXingKind } from './phira-score-presentation';
import { phiraGrade, type PhiraChart, type PhiraChartPage, type PhiraQueriedBest } from './phira';
import { normalizeNumericInput } from '@/utils/numeric-input';
export type PhiraRankFilter = PhiraRateKind | 'fc';
export const PHIRA_RANK_FILTERS: readonly { value: PhiraRankFilter; label: string }[] = ['phi', 'fc', 'v', 's', 'a', 'b', 'c', 'f'].map(value => ({ value: value as PhiraRankFilter, label: value === 'fc' ? 'FC' : PHIRA_RATE_LABELS[value as PhiraRateKind] }));
export function phiraRankFilterLabel(value: PhiraRankFilter | null): string { return value === null ? '全部' : PHIRA_RANK_FILTERS.find(item => item.value === value)?.label ?? '全部'; }

export type PhiraScoreSort = 'score' | 'acc' | 'constant';
export type PhiraCatalogSort = 'updated' | 'constant-asc' | 'constant-desc' | 'name';

export type PhiraScoreFilters = {
  keyword: string;
  constantMin: string;
  constantMax: string;
  accuracyMin: string;
  accuracyMax: string;
  rank: PhiraRankFilter | null;
  xing: PhiraXingKind | null;
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

export function phiraRecordXing(item: PhiraQueriedBest): PhiraXingKind | null {
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

/** 排序可能在请求间变化，跨页重复按 ID 去重。 */
export function dedupePhiraCharts(values: readonly PhiraChart[]): PhiraChart[] {
  const seen = new Set<number>();
  return values.filter((chart) => {
    if (seen.has(chart.id)) return false;
    seen.add(chart.id);
    return true;
  });
}

/** 服务端 page=0/1 均返回首页，后续从 2 开始。 */
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
