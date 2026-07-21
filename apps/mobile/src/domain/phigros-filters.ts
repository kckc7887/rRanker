import {
  LEVEL_NAMES,
  PHIGROS_MAX_SCORE,
  phigrosScoreToRate,
  type PhigrosLevel,
} from '@/domain/phigros';
import type { Difficulty } from '@/domain/models';

export type PhigrosRankFilter = 'phi' | 'fc' | 'v' | 's' | 'a' | 'b' | 'c' | 'f';

export const PHIGROS_LEVELS: readonly PhigrosLevel[] = [0, 1, 2, 3];

export const PHIGROS_RANK_FILTERS: readonly { value: PhigrosRankFilter; label: string }[] = [
  { value: 'phi', label: 'φ' },
  { value: 'fc', label: 'FC' },
  { value: 'v', label: 'V' },
  { value: 's', label: 'S' },
  { value: 'a', label: 'A' },
  { value: 'b', label: 'B' },
  { value: 'c', label: 'C' },
  { value: 'f', label: 'F' },
];

const LEVEL_TO_DIFFICULTY: Record<PhigrosLevel, Difficulty> = {
  0: 'basic',
  1: 'advanced',
  2: 'expert',
  3: 'master',
};

export function phigrosLevelLabel(level: PhigrosLevel | 'all'): string {
  if (level === 'all') return '全部';
  return LEVEL_NAMES[level];
}

export function phigrosLevelToDifficulty(level: PhigrosLevel): Difficulty {
  return LEVEL_TO_DIFFICULTY[level];
}

export function phigrosRankFilterLabel(value: PhigrosRankFilter | null): string {
  if (!value) return '全部';
  return PHIGROS_RANK_FILTERS.find((item) => item.value === value)?.label ?? '全部';
}

export function matchesPhigrosLevel(
  levelIndex: number,
  filter: PhigrosLevel | 'all',
): boolean {
  if (filter === 'all') return true;
  return levelIndex === filter;
}

/** φ = 满分；FC = Full Combo 且非 φ；其余按评价等级严格匹配 */
export function matchesPhigrosRankFilter(
  record: { dxScore?: number | null; fc?: string | null },
  filter: PhigrosRankFilter | null,
): boolean {
  if (!filter) return true;
  const score = record.dxScore ?? 0;
  const isFc = record.fc === 'ap';
  if (filter === 'fc') return isFc && score !== PHIGROS_MAX_SCORE;
  return phigrosScoreToRate(score, isFc) === filter;
}
