import { METRIC_GRADIENT_THEMES } from './metric-gradient-theme';

export function phigrosScoreGradient(variant: 'phi' | 'fc' | 'normal') {
  return variant === 'normal' ? undefined : {
    colors: variant === 'phi' ? METRIC_GRADIENT_THEMES.gold.colors : METRIC_GRADIENT_THEMES.mint.colors,
    duration: variant === 'phi' ? METRIC_GRADIENT_THEMES.gold.duration : METRIC_GRADIENT_THEMES.mint.duration,
    testID: variant === 'phi' ? 'phigros-flowing-score-phi' : 'phigros-flowing-score-fc',
  };
}
