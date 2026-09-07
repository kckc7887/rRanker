import { StatusMetricBadge } from '@/components/game-content/MetricBadges';
import { PHIGROS_RATE_COLORS, PHIGROS_RATE_LABELS, type PhigrosRateKind } from '@/domain/phigros-rate-theme';
export { PHIGROS_RATE_COLORS, PHIGROS_RATE_LABELS, resolvePhigrosRate, type PhigrosRateKind } from '@/domain/phigros-rate-theme';

export function PhigrosRateBadge({ rate, fc = false }: { rate: PhigrosRateKind; fc?: boolean }) {
  return <StatusMetricBadge text={PHIGROS_RATE_LABELS[rate]}
    colors={rate === 'v' && fc ? PHIGROS_RATE_COLORS.vFc : PHIGROS_RATE_COLORS[rate]} raised={rate === 'phi'} />;
}
