import { memo } from 'react';
import { View } from 'react-native';
import { COMPACT_METRIC_CARD_STYLES as styles, GameScoreCard } from '@/components/game-content/GameScoreCard';
import { PhigrosDifficultyBadge } from '@/components/phigros/PhigrosDifficultyBadge';
import { PhigrosRateBadge, resolvePhigrosRate } from '@/components/phigros/PhigrosRateBadge';
import { PhigrosScoreValue } from '@/components/phigros/PhigrosScoreValue';
import { PhigrosXingBadge } from '@/components/phigros/PhigrosXingBadge';
import type { PhiraQueriedBest } from '@/domain/phira';
import { presentPhiraScore } from '@/features/game-content/adapters';
import { useAppTheme } from '@/theme/app-theme';

export const PhiraScoreCard = memo(function PhiraScoreCard({ item, rank }: { item: PhiraQueriedBest; rank?: number }) {
  const theme = useAppTheme(); const record = item.record; const presentation = presentPhiraScore(item, rank);
  const score = record?.score ?? 0; const rate = resolvePhigrosRate({ dxScore: score, fc: record?.fullCombo ? 'ap' : null });
  const xingTone = presentation.achievementRows.flat().find((badge) => badge.key === 'xing')?.tone;
  const xing = xingTone === 'xing-good' ? 'good' : xingTone === 'xing-miss' ? 'miss' : null;
  return <GameScoreCard cardStyle={styles.card} mainStyle={styles.main} presentation={presentation} titleStyle={styles.title}
    metricSide={{ blockStyle: styles.stats, lines: [
      { text: presentation.secondaryMetrics[0]?.text, style: styles.acc, color: theme.text },
      { text: presentation.secondaryMetrics[1]?.text, style: styles.rks, color: item.poolRks == null ? theme.textMuted : theme.accent },
    ] }}>
    <PhigrosScoreValue score={score} variant={score >= 1_000_000 ? 'phi' : record?.fullCombo ? 'fc' : 'normal'} textColor={theme.text} />
    <View style={styles.tags}><PhigrosDifficultyBadge levelIndex={4} constant={item.chart.difficulty} labelOverride={item.chart.level} />
      <PhigrosRateBadge rate={rate} fc={record?.fullCombo} />
      {xing ? <PhigrosXingBadge kind={xing} /> : null}</View>
  </GameScoreCard>;
});
