import type {
  ChunithmDifficulty,
  ChunithmLevelIndex,
} from './chunithm';
import type { ChunithmRank } from './chunithm-score-presentation';

export const CHUNITHM_LEVELS: readonly ChunithmLevelIndex[] = [0, 1, 2, 3, 4, 5];

export const CHUNITHM_RANKS_ASC: readonly ChunithmRank[] = [
  'D', 'C', 'B', 'BB', 'BBB', 'A', 'AA', 'AAA',
  'S', 'S+', 'SS', 'SS+', 'SSS', 'SSS+',
];

export const CHUNITHM_RANKS_DESC: readonly ChunithmRank[] = [...CHUNITHM_RANKS_ASC].reverse();

export type ChunithmChartFilter = {
  difficulty: ChunithmLevelIndex | 'all';
  version: string | 'all';
  constantMin: string;
  constantMax: string;
};

export function parseChunithmConstantBound(input: string): number | undefined {
  const text = input.normalize('NFKC').trim().replace(',', '.');
  if (!text) return undefined;
  const value = Number(text);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

export function matchesChunithmConstantRange(
  constant: number | undefined,
  minInput: string,
  maxInput: string,
): boolean {
  const min = parseChunithmConstantBound(minInput);
  const max = parseChunithmConstantBound(maxInput);
  if (min !== undefined && max !== undefined && min > max) return false;
  if (min === undefined && max === undefined) return true;
  if (constant === undefined) return false;
  if (min !== undefined && constant < min) return false;
  if (max !== undefined && constant > max) return false;
  return true;
}

export function matchesChunithmChartFilter(
  chart: Pick<ChunithmDifficulty, 'difficulty' | 'levelValue' | 'versionId'>,
  filter: ChunithmChartFilter,
): boolean {
  if (filter.difficulty !== 'all' && chart.difficulty !== filter.difficulty) return false;
  if (filter.version !== 'all' && String(chart.versionId) !== filter.version) return false;
  return matchesChunithmConstantRange(
    chart.difficulty === 5 ? undefined : chart.levelValue,
    filter.constantMin,
    filter.constantMax,
  );
}

export function matchesChunithmRankRange(
  rank: ChunithmRank,
  min: ChunithmRank | null,
  max: ChunithmRank | null,
): boolean {
  const rankIndex = CHUNITHM_RANKS_ASC.indexOf(rank);
  const minIndex = min ? CHUNITHM_RANKS_ASC.indexOf(min) : undefined;
  const maxIndex = max ? CHUNITHM_RANKS_ASC.indexOf(max) : undefined;
  if (minIndex !== undefined && maxIndex !== undefined && minIndex > maxIndex) return false;
  if (minIndex !== undefined && rankIndex < minIndex) return false;
  if (maxIndex !== undefined && rankIndex > maxIndex) return false;
  return true;
}
