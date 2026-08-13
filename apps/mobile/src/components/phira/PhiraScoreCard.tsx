import { memo } from 'react';
import { Text, View } from 'react-native';
import { GameScoreCard } from '@/components/game-content/GameScoreCard';
import { PhigrosDifficultyBadge } from '@/components/phigros/PhigrosDifficultyBadge';
import { PhigrosRateBadge, resolvePhigrosRate } from '@/components/phigros/PhigrosRateBadge';
import { PhigrosScoreValue } from '@/components/phigros/PhigrosScoreValue';
import { PHIGROS_SCORE_CARD_STYLES as styles } from '@/components/phigros/PhigrosScoreCard';
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
    side={<View style={styles.stats}><Text style={[styles.acc, { color: theme.text }]}>{presentation.secondaryMetrics[0]?.text}</Text>
      <Text style={[styles.rks, { color: item.poolRks == null ? theme.textMuted : theme.accent }]}>{presentation.secondaryMetrics[1]?.text}</Text></View>}>
    <PhigrosScoreValue score={score} variant={score >= 1_000_000 ? 'phi' : record?.fullCombo ? 'fc' : 'normal'} textColor={theme.text} />
    <View style={styles.tags}><PhigrosDifficultyBadge levelIndex={4} constant={item.chart.difficulty} labelOverride={item.chart.level} />
      <PhigrosRateBadge rate={rate} fc={record?.fullCombo} />
      {xing ? <PhigrosXingBadge kind={xing} /> : null}</View>
  </GameScoreCard>;
});
