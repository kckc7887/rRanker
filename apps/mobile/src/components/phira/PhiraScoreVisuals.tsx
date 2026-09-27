import { DualTextMetricBadge, StatusMetricBadge } from '@/components/game-content/MetricBadges';
import { AnimatedMetricValue } from '@/components/game-content/AnimatedMetricValue';
import { PHIRA_RATE_COLORS, PHIRA_RATE_LABELS, PHIRA_DIFFICULTY_COLORS, PHIRA_XING_COLORS, phiraXingLabel, phiraScoreGradient, type PhiraRateKind, type PhiraXingKind } from '@/domain/phira-score-presentation';
export { resolvePhiraRate } from '@/domain/phira-score-presentation';
export function PhiraDifficultyBadge({ constant, label }: { constant: number; label: string }) {
  return <DualTextMetricBadge label={label} valueText={constant.toFixed(1)} colors={PHIRA_DIFFICULTY_COLORS} />;
}
export function PhiraRateBadge({ rate, fc }: { rate: PhiraRateKind; fc?: boolean }) {
  return <StatusMetricBadge text={PHIRA_RATE_LABELS[rate]}
    colors={rate === 'v' && fc ? PHIRA_RATE_COLORS.vFc : PHIRA_RATE_COLORS[rate]} raised={rate === 'phi'} />;
}
export function PhiraXingBadge({ kind }: { kind: PhiraXingKind }) {
  return <StatusMetricBadge text={phiraXingLabel(kind)} colors={PHIRA_XING_COLORS} />;
}
export function PhiraScoreValue({ score, variant, ...props }: {
  score: number; variant: 'phi' | 'fc' | 'normal'; textColor: string;
  fontSize?: number; lineHeight?: number; accessibilityLabel?: string;
}) {
  return <AnimatedMetricValue {...props} text={score.toLocaleString()} gradient={phiraScoreGradient(variant)} />;
}
