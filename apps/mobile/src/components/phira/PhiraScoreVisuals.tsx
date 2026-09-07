import { DualTextMetricBadge, StatusMetricBadge } from '@/components/game-content/MetricBadges';
import { phigrosLevelColors } from '@/domain/phigros-level-theme';
import { PHIGROS_RATE_COLORS, PHIGROS_RATE_LABELS, type PhigrosRateKind } from '@/domain/phigros-rate-theme';
import { phigrosXingLabel, PHIGROS_XING_COLORS, type PhigrosXingKind } from '@/domain/phigros-xing';
import { AnimatedMetricValue } from '@/components/game-content/AnimatedMetricValue';
import { phigrosScoreGradient } from '@/domain/phigros-score-theme';
export { resolvePhigrosRate as resolvePhiraRate } from '@/domain/phigros-rate-theme';
export function PhiraDifficultyBadge({ constant, label }: { constant: number; label: string }) {
  return <DualTextMetricBadge label={label} valueText={constant.toFixed(1)} colors={phigrosLevelColors(4)} />;
}
export function PhiraRateBadge({ rate, fc }: { rate: PhigrosRateKind; fc?: boolean }) {
  return <StatusMetricBadge text={PHIGROS_RATE_LABELS[rate]}
    colors={rate === 'v' && fc ? PHIGROS_RATE_COLORS.vFc : PHIGROS_RATE_COLORS[rate]} raised={rate === 'phi'} />;
}
export function PhiraXingBadge({ kind }: { kind: PhigrosXingKind }) {
  return <StatusMetricBadge text={phigrosXingLabel(kind)} colors={PHIGROS_XING_COLORS} />;
}
export function PhiraScoreValue({ score, variant, ...props }: {
  score: number; variant: 'phi' | 'fc' | 'normal'; textColor: string;
  fontSize?: number; lineHeight?: number; accessibilityLabel?: string;
}) {
  return <AnimatedMetricValue {...props} text={score.toLocaleString()} gradient={phigrosScoreGradient(variant)} />;
}
