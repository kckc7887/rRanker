import { DualTextMetricBadge } from '@/components/game-content/MetricBadges';
import { phigrosLevelColors, phigrosLevelLabel } from '@/domain/phigros-level-theme';

export function PhigrosDifficultyBadge({ levelIndex, constant, showLabel = true, showConstant = true, labelOverride }: {
  levelIndex: number; constant: number; showLabel?: boolean; showConstant?: boolean; labelOverride?: string;
}) {
  return <DualTextMetricBadge label={labelOverride ?? phigrosLevelLabel(levelIndex)} valueText={constant.toFixed(1)}
    colors={phigrosLevelColors(levelIndex)} showLabel={showLabel} showConstant={showConstant} />;
}
