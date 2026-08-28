import { useMemo } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { TufDifficultyBadge } from './TufDifficultyBadge';
import { GameScoreCard, useScoreCardArtworkActive } from '@/components/game-content/GameScoreCard';
import { LayeredGradientBadge } from '@/components/LayeredGradientBadge';
import { tufMediaImageCandidates, type TufPass } from '@/domain/tuf';
import { formatTufAccuracy, presentTufScore } from '@/features/game-content/adapters';
import { useAppTheme } from '@/theme/app-theme';
import { useTufVideoDetails } from '@/hooks/use-tuf';

export function TufWorldAchievementBadge({
  kind, testID, style,
}: {
  kind: 'wf' | 'pp';
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const label = kind.toUpperCase();
  return <View accessible accessibilityLabel={`${label} ${kind === 'wf' ? '世界首通' : '世界首杀'}`}
    style={style} testID={testID}>
    <LayeredGradientBadge label={label} tone="gold" testID={testID ? `${testID}-gradient` : undefined}
      style={styles.worldBadge} contentStyle={styles.worldBadgeContent} textStyle={styles.worldBadgeText} />
  </View>;
}

export function TufScoreCard({ pass, position }: { pass: TufPass; position?: number }) {
  const theme = useAppTheme();
  const artworkActive = useScoreCardArtworkActive();
  const media = useTufVideoDetails(pass.level.videoLink, artworkActive);
  const artworkSource = useMemo(
    () => tufMediaImageCandidates(media.data?.image, pass.level.difficulty?.icon)[0] ?? null,
    [media.data?.image, pass.level.difficulty?.icon],
  );
  const presentation = presentTufScore(pass, position);
  const impact = presentation.secondaryMetrics.find((metric) => metric.key === 'impact')?.text ?? '—';
  return <GameScoreCard artwork={{ source: artworkSource }} presentation={presentation} cardStyle={styles.card}
    mainStyle={styles.main} titleStyle={styles.title} pressedStyle={styles.pressed} testID={`tuf-pass-${pass.id}`}>
    <View style={styles.body}>
      <View style={styles.bodyMain}>
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
        <View style={styles.footerBadges}>
          <TufDifficultyBadge difficulty={presentation.difficulty} display="label"
            source={pass.level.difficulty} style={styles.difficulty} />
          {pass.isWorldsFirst ? <TufWorldAchievementBadge kind="wf" testID={`tuf-pass-${pass.id}-wf`} /> : null}
          {pass.isWorldsFirstPP ? <TufWorldAchievementBadge kind="pp" testID={`tuf-pass-${pass.id}-pp`} /> : null}
        </View>
      </View>
      <View style={styles.side}>
        <Text style={[styles.sideLabel, { color: theme.textMuted }]}>Impact</Text>
        <Text style={[styles.impact, { color: theme.accent }]}>{impact}</Text>
      </View>
    </View>
  </GameScoreCard>;
}

const styles = StyleSheet.create({
  card: { minHeight: 108, borderRadius: 14, padding: 14, flexDirection: 'row' },
  main: { flex: 1, minWidth: 0, gap: 9 },
  title: { fontSize: 16, fontWeight: '800' },
  pressed: { opacity: 0.76 },
  body: { flexDirection: 'row', alignItems: 'stretch', gap: 10 },
  bodyMain: { flex: 1, minWidth: 0, gap: 8 },
  scoreLine: { minHeight: 27, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  scoreLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.45 },
  score: { fontSize: 21, lineHeight: 25, fontWeight: '900', fontVariant: ['tabular-nums'] },
  metricChip: { minHeight: 22, borderWidth: StyleSheet.hairlineWidth, borderRadius: 999, paddingHorizontal: 7, alignItems: 'center', justifyContent: 'center' },
  metricChipText: { fontSize: 10, lineHeight: 14, fontWeight: '800', fontVariant: ['tabular-nums'] },
  impact: { fontSize: 19, lineHeight: 22, fontWeight: '900', fontVariant: ['tabular-nums'] },
  side: { minWidth: 68, alignItems: 'center', justifyContent: 'center', gap: 3 },
  sideLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.35 },
  footerBadges: { minHeight: 24, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5 },
  difficulty: { alignSelf: 'flex-start' },
  worldBadge: { minWidth: 34, height: 24 },
  worldBadgeContent: { paddingHorizontal: 7 },
  worldBadgeText: { fontSize: 9, lineHeight: 12, fontWeight: '900', letterSpacing: 0.45 },
});
