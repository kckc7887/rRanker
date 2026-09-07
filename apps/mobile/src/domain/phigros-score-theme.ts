type GradientColors = readonly [string, string, ...string[]];

/** V08 薄荷苏打：φ 蜂蜜金 / FC 薄荷天蓝 */
const PHI_BASE: GradientColors = [
  '#F5D76E', '#FDE68A', '#FBBF24', '#FCD34D', '#F59E0B', '#E8A317',
];
const FC_BASE: GradientColors = [
  '#38BDF8', '#6EE7B7', '#2DD4BF', '#7DD3FC', '#34D399',
];

const FLOW_GRADIENT_REPEATS = 3;
const FLOW_DURATION_PHI_MS = 3000;
const FLOW_DURATION_FC_MS = 2400;

function buildFlowingColors(base: GradientColors): GradientColors {
  const repeated = Array.from({ length: FLOW_GRADIENT_REPEATS }, () => [...base]).flat();
  return [...repeated, base[0]] as unknown as GradientColors;
}

const FLOWING_PHI = buildFlowingColors(PHI_BASE);
const FLOWING_FC = buildFlowingColors(FC_BASE);


export function phigrosScoreGradient(variant: 'phi' | 'fc' | 'normal') {
  return variant === 'normal' ? undefined : {
    colors: variant === 'phi' ? FLOWING_PHI : FLOWING_FC,
    duration: variant === 'phi' ? FLOW_DURATION_PHI_MS : FLOW_DURATION_FC_MS,
    testID: variant === 'phi' ? 'phigros-flowing-score-phi' : 'phigros-flowing-score-fc',
  };
}
