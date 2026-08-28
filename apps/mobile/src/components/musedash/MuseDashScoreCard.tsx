import { memo } from 'react';
import { StyleSheet } from 'react-native';
import { LayeredGradientBadge } from '@/components/LayeredGradientBadge';
import { MuseDashAccValue } from './MuseDashAccValue';
import { MuseDashAchievementBadge, MuseDashGradeBadge, MuseDashNeutralBadge, MuseDashRankBadge } from './MuseDashBadges';
import { MuseDashDifficultyBadge } from './MuseDashDifficultyBadge';
import { museDashUserIdFromAccountId } from '@/domain/bound-account';
import { museDashCoverUrl, museDashRankBadge, type MuseDashRawScore } from '@/domain/muse-dash';
import { useMuseDashPlayDetail } from '@/hooks/use-muse-dash';
import { useSession } from '@/state/session-store';
import { useAppTheme } from '@/theme/app-theme';
import { GameScoreCard } from '@/components/game-content/GameScoreCard';
import { presentMuseDashScore } from '@/features/game-content/adapters';

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
      artwork={{ source: museDashCoverUrl(score.song?.cover), scale: 1.08 }}
      cardStyle={styles.card}
      mainStyle={styles.main}
      presentation={presentation}
      pressedStyle={styles.pressed}
      metricSide={{
        blockStyle: styles.ratingBlock,
        lines: [
          { text: 'Rating', style: styles.ratingLabel, color: theme.textMuted },
          { text: ratingText, style: styles.rating, color: theme.accent },
        ],
      }}
      tagRows={{
        containerStyle: styles.tagRows,
        rowStyle: styles.tagRow,
        testID: `musedash-card-tags-${score.play.uid}-${score.play.difficulty}`,
        rows: [
          {
            content: <>
              <MuseDashDifficultyBadge
                constant={score.constant}
                display="label-and-value"
                level={score.song?.difficulty[score.play.difficulty]}
                levelIndex={score.play.difficulty}
              />
              {presentation.grade ? <MuseDashGradeBadge label={presentation.grade.label} tone={presentation.grade.tone} /> : null}
              {presentation.achievementRows.flat().filter((badge) => badge.key === 'achievement').map((badge) => (
                <MuseDashAchievementBadge key={badge.key} label={badge.label} tone={badge.tone} />
              ))}
              {rankBadge ? (rankBadge.tone === 'rank-rainbow'
                ? <LayeredGradientBadge key="rank" label={rankBadge.label} numberOfLines={1} tone="rainbow"
                  style={styles.rainbowBadge} textStyle={styles.rainbowBadgeText} />
                : <MuseDashRankBadge key="rank" label={rankBadge.label} tone={rankBadge.tone} />) : null}
            </>,
          },
          {
            content: <>
              {presentation.achievementRows.flat().filter((badge) => badge.key !== 'achievement').map((badge) => (
                <MuseDashNeutralBadge key={badge.key} label={badge.label} />
              ))}
              <MuseDashNeutralBadge label={platform === 'pc' ? 'PC 端' : '移动端'} />
            </>,
          },
        ],
      }}
      testID={`musedash-score-${score.play.uid}-${score.play.difficulty}`}
      titleStyle={styles.title}
    >
      <MuseDashAccValue acc={score.play.acc} />
    </GameScoreCard>
  );
});

const styles = StyleSheet.create({
  card: { borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  pressed: { opacity: 0.72 },
  main: { flex: 1, minWidth: 0, gap: 3 },
  title: { fontSize: 15, fontWeight: '700' },
  tagRows: { gap: 5, marginTop: 4 },
  tagRow: { minHeight: 24, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  rainbowBadge: { height: 28 },
  rainbowBadgeText: { fontSize: 10, fontWeight: '900' },
  ratingBlock: { minWidth: 58, alignItems: 'flex-end', gap: 2 },
  ratingLabel: { fontSize: 10, fontWeight: '700' },
  rating: { fontSize: 19, fontWeight: '900' },
});
