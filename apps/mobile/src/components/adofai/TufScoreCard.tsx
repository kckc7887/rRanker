import { StyleSheet, Text, View } from 'react-native';
import { TufDifficultyBadge } from './TufDifficultyBadge';
import { GameScoreCard } from '@/components/game-content/GameScoreCard';
import type { TufPass } from '@/domain/tuf';
import { formatTufAccuracy, presentTufScore } from '@/features/game-content/adapters';
import { useAppTheme } from '@/theme/app-theme';

export function TufScoreCard({ pass, position }: { pass: TufPass; position?: number }) {
  const theme = useAppTheme();
  const presentation = presentTufScore(pass, position);
  const impact = presentation.secondaryMetrics.find((metric) => metric.key === 'impact')?.text ?? '—';
  return <GameScoreCard presentation={presentation} cardStyle={styles.card}
    mainStyle={styles.main} titleStyle={styles.title} pressedStyle={styles.pressed} testID={`tuf-pass-${pass.id}`}
    side={<View style={styles.side}>
      <Text style={[styles.sideLabel, { color: theme.textMuted }]}>Impact</Text>
      <Text style={[styles.impact, { color: theme.accent }]}>{impact}</Text>
    </View>}>
    <View style={styles.scoreLine}>
      <Text style={[styles.scoreLabel, { color: theme.textMuted }]}>Score</Text>
      <Text style={[styles.score, { color: theme.text }]}>{presentation.primaryMetric.text}</Text>
      <View style={[styles.metricChip, { backgroundColor: theme.surfaceMuted, borderColor: theme.border }]}>
        <Text style={[styles.metricChipText, { color: theme.textSecondary }]}>{formatTufAccuracy(pass.accuracy)}</Text>
      </View>
      <View style={[styles.metricChip, { backgroundColor: theme.surfaceMuted, borderColor: theme.border }]}>
        <Text style={[styles.metricChipText, { color: theme.textSecondary }]}>{pass.speed.toFixed(2)}×</Text>
      </View>
    </View>
    <TufDifficultyBadge difficulty={presentation.difficulty} display="label"
      source={pass.level.difficulty} style={styles.difficulty} />
  </GameScoreCard>;
}

const styles = StyleSheet.create({
  card: { minHeight: 102, borderRadius: 14, padding: 14, flexDirection: 'row', gap: 12 },
  main: { flex: 1, minWidth: 0, gap: 9 },
  title: { fontSize: 16, fontWeight: '800' },
  pressed: { opacity: 0.76 },
  scoreLine: { minHeight: 27, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  scoreLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.45 },
  score: { fontSize: 21, lineHeight: 25, fontWeight: '900', fontVariant: ['tabular-nums'] },
  metricChip: { minHeight: 22, borderWidth: StyleSheet.hairlineWidth, borderRadius: 999, paddingHorizontal: 7, alignItems: 'center', justifyContent: 'center' },
  metricChipText: { fontSize: 10, lineHeight: 14, fontWeight: '800', fontVariant: ['tabular-nums'] },
  impact: { fontSize: 19, lineHeight: 22, fontWeight: '900', fontVariant: ['tabular-nums'] },
  side: { minWidth: 68, alignItems: 'center', justifyContent: 'center', gap: 3 },
  sideLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.35 },
  difficulty: { alignSelf: 'flex-start' },
});
