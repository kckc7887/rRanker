import { StatusMetricBadge } from '@/components/game-content/MetricBadges';
import { phigrosXingLabel, PHIGROS_XING_COLORS, type PhigrosXingKind } from '@/domain/phigros-xing';
export { PHIGROS_XING_COLORS } from '@/domain/phigros-xing';
export function PhigrosXingBadge({ kind }: { kind: PhigrosXingKind }) {
  return <StatusMetricBadge text={phigrosXingLabel(kind)} colors={PHIGROS_XING_COLORS} />;
}
