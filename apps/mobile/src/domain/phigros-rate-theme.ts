import { phigrosScoreToRate } from './phigros';
import type { ScoreRecord } from './models';
import { SCORE_GRADE_COLORS, SCORE_GRADE_LABELS, type ScoreGradeKind } from './score-grade-theme';
export type PhigrosRateKind = ScoreGradeKind;
export const PHIGROS_RATE_COLORS = SCORE_GRADE_COLORS;
export const PHIGROS_RATE_LABELS = SCORE_GRADE_LABELS;

export function resolvePhigrosRate(record: Pick<ScoreRecord, 'dxScore' | 'fc'>): PhigrosRateKind {
  const rate = phigrosScoreToRate(record.dxScore ?? 0, record.fc === 'ap') as PhigrosRateKind;
  if (rate in PHIGROS_RATE_LABELS) return rate;
  return 'f';
}
