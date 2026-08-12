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
      <TufDifficultyBadge difficulty={presentation.difficulty} />
    </View>}>
    <View style={styles.metrics}>
      <Text style={[styles.scoreLabel, { color: theme.textMuted }]}>Score V2</Text>
      <Text style={[styles.score, { color: theme.text }]}>{presentation.primaryMetric.text}</Text>
      <Text style={[styles.metric, { color: theme.textMuted }]}>XACC {formatTufAccuracy(pass.accuracy)} · {pass.speed.toFixed(2)}x</Text>
    </View>
    <View style={styles.badges}>{presentation.achievementRows.flat().map((badge) => (
      <View key={badge.key} style={[styles.badge, { borderColor: theme.border }]}>
        <Text style={[styles.badgeText, { color: theme.textMuted }]}>{badge.label}{badge.value ? ` ${badge.value}` : ''}</Text>
      </View>
    ))}</View>
  </GameScoreCard>;
}

const styles = StyleSheet.create({
  card: { minHeight: 112, borderRadius: 14, padding: 14, flexDirection: 'row', gap: 12 },
  main: { flex: 1, gap: 7 },
  title: { fontSize: 16, fontWeight: '800' },
  pressed: { opacity: 0.76 },
  metrics: { gap: 1 },
  scoreLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.45 },
  score: { fontSize: 21, lineHeight: 25, fontWeight: '900', fontVariant: ['tabular-nums'] },
  metric: { fontSize: 12 },
  impact: { fontSize: 19, lineHeight: 22, fontWeight: '900', fontVariant: ['tabular-nums'] },
  side: { minWidth: 72, alignItems: 'flex-end', gap: 3 },
  sideLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.35 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  badge: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 },
  badgeText: { fontSize: 9, fontWeight: '700' },
});
