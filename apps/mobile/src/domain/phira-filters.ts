import type { PhigrosRankFilter } from './phigros-filters';
import type { PhigrosXingKind } from './phigros-xing';
import { phiraGrade, type PhiraChart, type PhiraQueriedBest } from './phira';

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
  const normalized = value.normalize('NFKC').trim().replace(',', '.');
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
