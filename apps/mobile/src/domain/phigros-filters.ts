import {
  LEVEL_NAMES,
  PHIGROS_MAX_SCORE,
  phigrosScoreToRate,
  type PhigrosLevel,
} from '@/domain/phigros';
import { PHIGROS_RATE_LABELS, type PhigrosRateKind } from '@/domain/phigros-rate-theme';
import type { Difficulty } from '@/domain/models';

export type PhigrosRankFilter = PhigrosRateKind | 'fc';

export const PHIGROS_LEVELS: readonly PhigrosLevel[] = [0, 1, 2, 3];

/** 与成绩卡片评价标签一致：φ / FC / V / S / A / B / C / F */
export const PHIGROS_RANK_FILTERS: readonly { value: PhigrosRankFilter; label: string }[] = [
  { value: 'phi', label: PHIGROS_RATE_LABELS.phi },
  { value: 'fc', label: 'FC' },
  { value: 'v', label: PHIGROS_RATE_LABELS.v },
  { value: 's', label: PHIGROS_RATE_LABELS.s },
  { value: 'a', label: PHIGROS_RATE_LABELS.a },
  { value: 'b', label: PHIGROS_RATE_LABELS.b },
  { value: 'c', label: PHIGROS_RATE_LABELS.c },
  { value: 'f', label: PHIGROS_RATE_LABELS.f },
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

export function parsePhigrosScoreBound(input: string): number | undefined {
  const text = input.normalize('NFKC').trim().replace(',', '.');
  if (!text) return undefined;
  const value = Number(text);
  return Number.isFinite(value) && value >= 0 && value <= PHIGROS_MAX_SCORE ? value : undefined;
}

/** 分数区间（dxScore）；空上下限表示不限；非法或上下限颠倒时不匹配 */
export function matchesPhigrosScoreRange(
  score: number | null | undefined,
  minInput: string,
  maxInput: string,
): boolean {
  const value = score ?? 0;
  const min = parsePhigrosScoreBound(minInput);
  const max = parsePhigrosScoreBound(maxInput);
  if (min !== undefined && max !== undefined && min > max) return false;
  if (min !== undefined && value < min) return false;
  if (max !== undefined && value > max) return false;
  return true;
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
