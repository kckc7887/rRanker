import { PhiraDifficultyBadge, PhiraRateBadge, resolvePhiraRate, PhiraScoreValue, PhiraXingBadge } from './PhiraScoreVisuals';
import { memo } from 'react';
import { View } from 'react-native';
import { COMPACT_METRIC_CARD_STYLES as styles, GameScoreCard } from '@/components/game-content/GameScoreCard';
import type { PhiraQueriedBest } from '@/domain/phira';
import { presentPhiraScore } from '@/features/game-content/adapters';
import { useAppTheme } from '@/theme/app-theme';

export const PhiraScoreCard = memo(function PhiraScoreCard({ item, rank }: { item: PhiraQueriedBest; rank?: number }) {
  const theme = useAppTheme(); const record = item.record; const presentation = presentPhiraScore(item, rank);
  const score = record?.score ?? 0; const rate = resolvePhiraRate({ dxScore: score, fc: record?.fullCombo ? 'ap' : null });
  const xingTone = presentation.achievementRows.flat().find((badge) => badge.key === 'xing')?.tone;
  const xing = xingTone === 'xing-good' ? 'good' : xingTone === 'xing-miss' ? 'miss' : null;
  return <GameScoreCard artwork={{ source: item.chart.illustration }} cardStyle={styles.card} mainStyle={styles.main} presentation={presentation} titleStyle={styles.title}
    metricSide={{ blockStyle: styles.stats, lines: [
      { text: presentation.secondaryMetrics[0]?.text, style: styles.acc, color: theme.text },
      { text: presentation.secondaryMetrics[1]?.text, style: styles.rks, color: item.poolRks == null ? theme.textMuted : theme.accent },
    ] }}>
    <PhiraScoreValue score={score} variant={score >= 1_000_000 ? 'phi' : record?.fullCombo ? 'fc' : 'normal'} textColor={theme.text} />
    <View style={styles.tags}><PhiraDifficultyBadge constant={item.chart.difficulty} label={item.chart.level} />
      <PhiraRateBadge rate={rate} fc={record?.fullCombo} />
      {xing ? <PhiraXingBadge kind={xing} /> : null}</View>
  </GameScoreCard>;
});
