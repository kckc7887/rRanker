type GradientColors = readonly [string, string, ...string[]];

const GOLD: GradientColors = [
  '#F5D76E', '#FDE68A', '#FBBF24', '#FCD34D', '#F59E0B', '#E8A317',
];
const MINT: GradientColors = [
  '#38BDF8', '#6EE7B7', '#2DD4BF', '#7DD3FC', '#34D399',
];

function flowingColors(base: GradientColors): GradientColors {
  const repeated = Array.from({ length: 3 }, () => [...base]).flat();
  return [...repeated, base[0]] as unknown as GradientColors;
}

export const METRIC_GRADIENT_THEMES = {
  gold: { baseColors: GOLD, colors: flowingColors(GOLD), duration: 3000 },
  mint: { baseColors: MINT, colors: flowingColors(MINT), duration: 2400 },
};
