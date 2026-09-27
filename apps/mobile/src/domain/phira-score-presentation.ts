import { phiraGrade, type PhiraRecord } from './phira';
import { SCORE_GRADE_COLORS, SCORE_GRADE_LABELS, type ScoreGradeKind } from './score-grade-theme';
import { METRIC_GRADIENT_THEMES } from './metric-gradient-theme';
export type PhiraRateKind = ScoreGradeKind;
export type PhiraXingKind = 'good' | 'miss';
export const PHIRA_RATE_COLORS = SCORE_GRADE_COLORS;
export const PHIRA_RATE_LABELS = SCORE_GRADE_LABELS;
export const PHIRA_DIFFICULTY_COLORS = { bg: '#F3F4F6', fg: '#6B7280' };
export const PHIRA_XING_COLORS = { bg: '#FFF7ED', fg: '#EA580C' };
export function resolvePhiraRate(record: Pick<PhiraRecord, 'score' | 'fullCombo'>): PhiraRateKind {
  const grade = phiraGrade(record);
  return grade === 'FC' ? 'v' : grade.toLowerCase() as PhiraRateKind;
}
export function phiraXingLabel(kind: PhiraXingKind): string { return kind === 'good' ? 'XING-GOOD' : 'XING-MISS'; }
export function phiraScoreGradient(variant: 'phi' | 'fc' | 'normal') {
  if (variant === 'normal') return undefined;
  const theme = variant === 'phi' ? METRIC_GRADIENT_THEMES.gold : METRIC_GRADIENT_THEMES.mint;
  return { colors: theme.colors, duration: theme.duration, testID: variant === 'phi' ? 'phigros-flowing-score-phi' : 'phigros-flowing-score-fc' };
}
