import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { GameScoreCard, COMPACT_METRIC_CARD_STYLES as styles } from '@/components/game-content/GameScoreCard';
import type { RizlineRecord } from '@/domain/rizline';
import { presentRizlineScore } from '@/features/game-content/adapters/rizline';
import { useAppTheme } from '@/theme/app-theme';
import { RizlineAccuracyValue, RizlineDifficultyBadge, RizlineStatusBadge } from './RizlineScoreVisuals';

export const RizlineScoreCard = memo(function RizlineScoreCard({ record, title, rank, artworkSource }: {
  record: RizlineRecord; title?: string; rank?: number; artworkSource?: string | null;
}) {
  const theme = useAppTheme();
  const presentation = presentRizlineScore(record, title, rank);
  return <GameScoreCard testID={`rizline-score-${record.chartId}`} presentation={presentation}
    artwork={{ source: artworkSource }} cardStyle={styles.card} mainStyle={styles.main} titleStyle={styles.title}
    metricSide={{ blockStyle: styles.stats, lines: [
      { text: presentation.secondaryMetrics[0]?.label, style: localStyles.metricLabel, color: theme.textMuted },
      { text: presentation.secondaryMetrics[0]?.text, style: styles.rks, color: theme.accent },
    ] }}>
    <RizlineAccuracyValue record={record} text={presentation.primaryMetric.text} />
    <View style={styles.tags}><RizlineDifficultyBadge difficulty={record.difficulty} level={record.chart?.level} /><RizlineStatusBadge record={record} /></View>
  </GameScoreCard>;
});

const localStyles = StyleSheet.create({ metricLabel: { fontSize: 10, fontWeight: '700' } });
