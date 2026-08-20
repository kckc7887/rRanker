import { StyleSheet, Text, View } from 'react-native';
import {
  COMPACT_METRIC_CARD_STYLES,
  GameScoreCard,
} from '@/components/game-content/GameScoreCard';
import type { OsuGameId } from '@/domain/game-mode-family';
import { formatOsuAccuracy, formatOsuPp, type OsuBestScore } from '@/domain/osu';
import { useAppTheme } from '@/theme/app-theme';
import { OsuDifficultyBadge } from './OsuDifficultyBadge';
import { OsuModBadge } from './OsuModBadge';
import { OsuRankTag } from './OsuRankTag';

/**
 * osu! 最佳成绩卡：标题歌名、主信息得分、下方难度标签（N★）+ 评价标签、
 * 右侧上下居中小字准确率 + 大字 PP。点击进入歌曲详情页（songId = beatmapset id）。
 */
export function OsuScoreCard({ gameId, score, position, detailScoreId }: {
  gameId: OsuGameId;
  score: OsuBestScore;
  position?: number;
  detailScoreId?: number;
}) {
  const theme = useAppTheme();
  const ppText = score.pp == null ? '—' : formatOsuPp(score.pp);
  return (
    <GameScoreCard
      presentation={{
        key: String(score.id),
        gameId,
        route: {
          songId: String(score.beatmapset.id),
          levelIndex: score.beatmap.id,
          ...(detailScoreId === undefined ? {} : { params: { scoreId: String(detailScoreId) } }),
        },
        position,
        title: score.beatmapset.title,
        accessibilityLabel: `成绩 ${score.beatmapset.title}，得分 ${score.score.toLocaleString('en-US')}，准确率 ${formatOsuAccuracy(score.accuracy)}，PP ${ppText}`,
        primaryMetric: {
          key: 'score',
          label: 'Score',
          text: score.score.toLocaleString('en-US'),
        },
        secondaryMetrics: [],
        difficulty: { key: 'difficulty', label: '★', value: '', tone: 'osu-star' },
        achievementRows: [],
      }}
      cardStyle={COMPACT_METRIC_CARD_STYLES.card}
      mainStyle={COMPACT_METRIC_CARD_STYLES.main}
      titleStyle={COMPACT_METRIC_CARD_STYLES.title}
      pressedStyle={styles.pressed}
      metricSide={{
        blockStyle: COMPACT_METRIC_CARD_STYLES.stats,
        lines: [
          { text: formatOsuAccuracy(score.accuracy), style: COMPACT_METRIC_CARD_STYLES.acc, color: theme.textMuted },
          { text: ppText, style: COMPACT_METRIC_CARD_STYLES.rks, color: theme.accent },
        ],
      }}
      tagRows={{
        containerStyle: COMPACT_METRIC_CARD_STYLES.tags,
        rowStyle: styles.tagRow,
        rows: [{
          content: (
            <>
              <OsuDifficultyBadge star={score.beatmap.difficultyRating} />
              <OsuRankTag rank={score.rank} testID={`osu-rank-tag-${score.rank}`} />
              {(score.mods ?? []).map((acronym) => (
                <OsuModBadge key={acronym} acronym={acronym} />
              ))}
            </>
          ),
          testID: 'osu-score-card-tags',
        }],
      }}
      testID={`osu-score-card-${score.id}`}
    >
      <View style={styles.scoreBlock}>
        <Text style={[styles.scoreLabel, { color: theme.textMuted }]}>Score</Text>
        <Text style={[styles.score, { color: theme.text }]}>
          {score.score.toLocaleString('en-US')}
        </Text>
      </View>
    </GameScoreCard>
  );
}

const styles = StyleSheet.create({
  scoreBlock: { gap: 1 },
  scoreLabel: { fontSize: 11, fontWeight: '700' },
  score: { fontSize: 24, fontWeight: '900', letterSpacing: 0.2 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 5 },
  pressed: { opacity: 0.7 },
});
