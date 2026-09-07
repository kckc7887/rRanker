import { AnimatedMetricValue } from '@/components/game-content/AnimatedMetricValue';
import { phigrosScoreGradient } from '@/domain/phigros-score-theme';
export function PhigrosScoreValue({ score, variant, ...props }: {
  score: number; variant: 'phi' | 'fc' | 'normal'; textColor: string;
  fontSize?: number; lineHeight?: number; accessibilityLabel?: string;
}) {
  return <AnimatedMetricValue {...props} text={score.toLocaleString()} gradient={phigrosScoreGradient(variant)} />;
}
