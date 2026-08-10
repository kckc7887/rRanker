import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LayeredGradientBadge } from '@/components/LayeredGradientBadge';
import { MuseDashAccValue } from './MuseDashAccValue';
import { MuseDashAchievementBadge, MuseDashGradeBadge, MuseDashRankBadge } from './MuseDashBadges';
import { MuseDashDifficultyBadge } from './MuseDashDifficultyBadge';
import { museDashUserIdFromAccountId } from '@/domain/bound-account';
import { museDashRankBadge, type MuseDashRawScore } from '@/domain/muse-dash';
import { useMuseDashPlayDetail } from '@/hooks/use-muse-dash';
import { useSession } from '@/state/session-store';
import { useAppTheme } from '@/theme/app-theme';
import { GameScoreCard } from '@/components/game-content/GameScoreCard';
import { presentMuseDashScore } from '@/features/game-content/adapters';

/** 角色/精灵/平台信息徽章：中性灰胶囊。 */
function NeutralBadge({ label, testID }: { label: string; testID?: string }) {
  return <View style={styles.neutralBadge} testID={testID}>
    <Text style={styles.neutralBadgeText}>{label}</Text>
  </View>;
}

export const MuseDashScoreCard = memo(function MuseDashScoreCard({
  score,
  position,
}: {
  score: MuseDashRawScore;
  position?: number;
}) {
  const theme = useAppTheme();
  const accountId = useSession((state) => state.activeAccountId);
  const userId = museDashUserIdFromAccountId(accountId);
  const platform = score.play.platform ?? 'mobile';
  const detail = useMuseDashPlayDetail(score.play.uid, score.play.difficulty, platform, userId);
  const presentation = presentMuseDashScore(score, { detail: detail.data, position });
  const currentRank = score.play.i ?? score.play.history?.lastRank ?? 0;
  const rankBadge = museDashRankBadge(currentRank);
  const ratingText = presentation.secondaryMetrics.find((metric) => metric.key === 'rating')?.text ?? '—';
  return (
    <GameScoreCard
      cardStyle={styles.card}
      mainStyle={styles.main}
      presentation={presentation}
      pressedStyle={styles.pressed}
      side={<View style={styles.ratingBlock}>
        <Text style={[styles.ratingLabel, { color: theme.textMuted }]}>Rating</Text>
        <Text style={[styles.rating, { color: theme.accent }]}>{ratingText}</Text>
      </View>}
      testID={`musedash-score-${score.play.uid}-${score.play.difficulty}`}
      titleStyle={styles.title}
    >
      <MuseDashAccValue acc={score.play.acc} />
      <View style={styles.tagRow} testID={`musedash-card-tags-${score.play.uid}-${score.play.difficulty}`}>
        <MuseDashDifficultyBadge
          constant={score.constant}
          display="label-and-value"
          level={score.song?.difficulty[score.play.difficulty]}
          levelIndex={score.play.difficulty}
        />
        {presentation.grade ? <MuseDashGradeBadge label={presentation.grade.label} tone={presentation.grade.tone} /> : null}
        {presentation.achievementRows.flat().map((badge) => (
          badge.key === 'achievement'
            ? <MuseDashAchievementBadge key={badge.key} label={badge.label} tone={badge.tone} />
            : <NeutralBadge key={badge.key} label={badge.label} />
        ))}
        {rankBadge ? (rankBadge.tone === 'rank-rainbow'
          ? <LayeredGradientBadge key="rank" label={rankBadge.label} numberOfLines={1} tone="rainbow"
            style={styles.rainbowBadge} textStyle={styles.rainbowBadgeText} />
          : <MuseDashRankBadge key="rank" label={rankBadge.label} tone={rankBadge.tone} />) : null}
        <NeutralBadge label={platform === 'pc' ? 'PC 端' : '移动端'} />
      </View>
    </GameScoreCard>
  );
});

const styles = StyleSheet.create({
  card: { borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  pressed: { opacity: 0.72 },
  main: { flex: 1, minWidth: 0, gap: 3 },
  title: { fontSize: 15, fontWeight: '700' },
  tagRow: { minHeight: 24, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 4 },
  neutralBadge: {
    minWidth: 32,
    height: 24,
    borderRadius: 999,
    paddingHorizontal: 10,
    backgroundColor: '#9CA3AF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  neutralBadgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900' },
  rainbowBadge: { height: 28 },
  rainbowBadgeText: { fontSize: 10, fontWeight: '900' },
  ratingBlock: { minWidth: 58, alignItems: 'flex-end', gap: 2 },
  ratingLabel: { fontSize: 10, fontWeight: '700' },
  rating: { fontSize: 19, fontWeight: '900' },
});
