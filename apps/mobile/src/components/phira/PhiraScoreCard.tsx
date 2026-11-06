import { PhiraDifficultyBadge, PhiraRateBadge, resolvePhiraRate, PhiraScoreValue, PhiraXingBadge } from './PhiraScoreVisuals';
import { memo } from 'react';
import { GameScoreCard, ScoreCardMetric, ScoreCardBadges } from '@/components/game-content/GameScoreCard';
import type { PhiraQueriedBest } from '@/domain/phira';
import { presentPhiraScore } from '@/features/game-content/adapters';
import { useAppTheme } from '@/theme/app-theme';

export const PhiraScoreCard = memo(function PhiraScoreCard({ item, rank }: { item: PhiraQueriedBest; rank?: number }) {
  const theme = useAppTheme(); const record = item.record; const presentation = presentPhiraScore(item, rank);
  const score = record?.score ?? 0; const rate = resolvePhiraRate({ score, fullCombo: record?.fullCombo ?? false });
  const xingTone = presentation.achievementRows.flat().find((badge) => badge.key === 'xing')?.tone;
  const xing = xingTone === 'xing-good' ? 'good' : xingTone === 'xing-miss' ? 'miss' : null;
  return <GameScoreCard artwork={{ source: item.chart.illustration }} presentation={presentation}
    side={<ScoreCardMetric numericLabel label={presentation.secondaryMetrics[0]?.text} labelColor={theme.text}
      value={presentation.secondaryMetrics[1]?.text} valueColor={item.poolRks == null ? theme.textMuted : theme.accent} />}>
    <PhiraScoreValue score={score} variant={score >= 1_000_000 ? 'phi' : record?.fullCombo ? 'fc' : 'normal'} textColor={theme.text} />
    <ScoreCardBadges><PhiraDifficultyBadge constant={item.chart.difficulty} label={item.chart.level} />
      <PhiraRateBadge rate={rate} fc={record?.fullCombo} />
      {xing ? <PhiraXingBadge kind={xing} /> : null}</ScoreCardBadges>
  </GameScoreCard>;
});
