import { StyleSheet, Text, View } from 'react-native';
import { GameScoreCard } from '@/components/game-content/GameScoreCard';
import type { MuseDashRawScore } from '@/domain/muse-dash';
import { presentMuseDashScore } from '@/features/game-content/adapters';
import { useAppTheme } from '@/theme/app-theme';

export function MuseDashScoreCard({ score, position }: { score: MuseDashRawScore; position?: number }) {
  const theme = useAppTheme();
  const p = presentMuseDashScore(score, position);
  return <GameScoreCard presentation={p} cardStyle={[styles.card, { borderColor: theme.border }]}
    mainStyle={styles.main} titleStyle={styles.title} pressedStyle={styles.pressed} testID={`musedash-score-${score.play.uid}-${score.play.difficulty}`}
    side={<View style={styles.side}>
      <Text style={[styles.difficulty, { color: theme.accent }]}>{p.difficulty.label}</Text>
      <Text style={[styles.constant, { color: theme.textMuted }]}>{p.difficulty.value ?? '—'}</Text>
    </View>}>
    <View style={styles.metrics}>
      <Text style={[styles.score, { color: theme.text }]}>{p.primaryMetric.text}</Text>
      <Text style={[styles.metric, { color: theme.textMuted }]}>
        ACC {formatAcc(score.play.acc)} · Rating {score.play.sum == null ? '—' : String(score.play.sum)} · 排名 #{currentRank(score)}
      </Text>
    </View>
    <View style={styles.badges}>{p.achievementRows.flat().map((badge) => (
      <View key={badge.key} style={[styles.badge, { borderColor: theme.border }]}>
        <Text style={[styles.badgeText, { color: theme.textMuted }]}>{badge.label}</Text>
      </View>
    ))}</View>
  </GameScoreCard>;
}

function formatAcc(value: number): string {
  return `${value.toFixed(2)}%`;
}

function currentRank(score: MuseDashRawScore): number {
  return score.play.i ?? score.play.history?.lastRank ?? 0;
}

const styles = StyleSheet.create({
  card: { minHeight: 112, borderRadius: 15, borderWidth: StyleSheet.hairlineWidth, padding: 14, flexDirection: 'row', gap: 10 },
  main: { flex: 1, gap: 7 }, title: { fontSize: 16, fontWeight: '800' }, pressed: { opacity: 0.82 },
  metrics: { gap: 2 }, score: { fontSize: 19, fontWeight: '900', fontVariant: ['tabular-nums'] },
  metric: { fontSize: 12 },
  side: { alignItems: 'flex-end', gap: 2 }, difficulty: { fontSize: 12, fontWeight: '800' }, constant: { fontSize: 12 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 }, badge: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 }, badgeText: { fontSize: 9, fontWeight: '700' },
});
