import { memo, useState } from 'react';
import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Animated,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
} from 'react-native';
import { ChunithmDifficultyBadge } from './ChunithmDifficultyBadge';
import { useFlowingProgress } from '@/components/game-content/use-flowing-progress';
import {
  chunithmAchievementBadges,
  chunithmRankUsesGradient,
  formatChunithmRating,
  formatChunithmScore,
  type ChunithmAchievementTone,
  type ChunithmRank,
  type ChunithmScoreCardData,
} from '@/domain/chunithm-score-presentation';
import { useAppTheme } from '@/theme/app-theme';
import { GameScoreCard } from '@/components/game-content/GameScoreCard';
import { presentChunithmScore } from '@/features/game-content/adapters';

type GradientColors = readonly [string, string, ...string[]];
type GradientLocations = readonly [number, number, ...number[]];

export const CHUNITHM_RANK_GRADIENT: GradientColors = [
  '#73CFFF', '#EFCB63', '#FF8EC8', '#73CFFF',
];
export const CHUNITHM_RANK_GRADIENT_LOCATIONS: GradientLocations = [
  0, 1 / 3, 2 / 3, 1,
];
export const CHUNITHM_FLOWING_RANK_GRADIENT: GradientColors = [
  '#73CFFF', '#EFCB63', '#FF8EC8', '#73CFFF',
  '#EFCB63', '#FF8EC8', '#73CFFF',
];
export const CHUNITHM_FLOWING_RANK_LOCATIONS: GradientLocations = [
  0, 1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6, 1,
];

const BADGE_TONES: Record<Exclude<ChunithmAchievementTone, 'neutral'> | 'rank', {
  border: GradientColors;
  fill: GradientColors;
  locations?: GradientLocations;
  text: string;
}> = {
  rank: {
    border: ['#287DA8', '#8C6A14', '#A84F82', '#287DA8'],
    fill: CHUNITHM_RANK_GRADIENT,
    locations: CHUNITHM_RANK_GRADIENT_LOCATIONS,
    text: '#303136',
  },
  rainbow: {
    border: ['#8E2437', '#984D19', '#796515', '#256B39', '#205E7A', '#384181', '#692C7C'],
    fill: ['#FF9CA8', '#FFC07E', '#EADB72', '#88CF96', '#79BFDB', '#9199DC', '#C28BD4'],
    text: '#303136',
  },
  platinum: {
    border: ['#7D8795', '#BEC6D1', '#8E99A8'],
    fill: ['#DCE3EC', '#FFFFFF', '#C8D1DD', '#FFFFFF'],
    text: '#394454',
  },
  gold: {
    border: ['#84530A', '#A46E12', '#765006', '#A46E12', '#84530A'],
    fill: ['#FFF3B0', '#F6DC7D', '#E8BF54', '#F6DC7D', '#FFF3B0'],
    text: '#4B3A05',
  },
};

const SHIMMER: GradientColors = [
  'rgba(255,255,255,0)', 'rgba(255,255,255,0.28)', 'rgba(255,255,255,0)',
];

export function ChunithmGradientScore({
  text,
  flowing,
  height = 30,
  textStyle,
}: {
  text: string;
  flowing: boolean;
  height?: number;
  textStyle?: StyleProp<TextStyle>;
}) {
  const [width, setWidth] = useState(180);
  const progress = useFlowingProgress(flowing, 1_800);
  const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [-width, 0] });
  return (
    <MaskedView
      accessibilityLabel={text}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={[styles.scoreMask, { height }]}
      testID={flowing ? 'flowing-chunithm-score' : 'gradient-chunithm-score'}
      maskElement={<Text style={[styles.score, textStyle, styles.maskText]}>{text}</Text>}
    >
      {flowing ? (
        <Animated.View style={[styles.flowTrack, { width: width * 2, transform: [{ translateX }] }]}>
          <LinearGradient
            colors={CHUNITHM_FLOWING_RANK_GRADIENT}
            end={{ x: 1, y: 0.5 }}
            locations={CHUNITHM_FLOWING_RANK_LOCATIONS}
            start={{ x: 0, y: 0.5 }}
            style={StyleSheet.absoluteFill}
            testID="chunithm-flowing-score-gradient"
          />
        </Animated.View>
      ) : (
        <LinearGradient
          colors={CHUNITHM_RANK_GRADIENT}
          end={{ x: 1, y: 0.5 }}
          locations={CHUNITHM_RANK_GRADIENT_LOCATIONS}
          start={{ x: 0, y: 0.5 }}
          style={StyleSheet.absoluteFill}
          testID="chunithm-static-score-gradient"
        />
      )}
    </MaskedView>
  );
}

function GradientBadge({
  label,
  tone,
  flowing = false,
  testID,
}: {
  label: string;
  tone: Exclude<ChunithmAchievementTone, 'neutral'> | 'rank';
  flowing?: boolean;
  testID: string;
}) {
  const colors = BADGE_TONES[tone];
  const [width, setWidth] = useState(60);
  const progress = useFlowingProgress(flowing, 1_400);
  const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [-width, 0] });
  return (
    <LinearGradient
      colors={colors.border}
      end={{ x: 1, y: 0.5 }}
      {...(colors.locations ? { locations: colors.locations } : {})}
      start={{ x: 0, y: 0.5 }}
      style={styles.badgeFrame}
      testID={testID}
    >
      <LinearGradient
        colors={colors.fill}
        end={{ x: 1, y: 0.5 }}
        {...(colors.locations ? { locations: colors.locations } : {})}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        start={{ x: 0, y: 0.5 }}
        style={styles.badgeFill}
      >
        <View pointerEvents="none" style={styles.badgeOverlay} />
        {flowing ? (
          <Animated.View style={[styles.flowTrack, { width: width * 2, transform: [{ translateX }] }]}>
            <LinearGradient
              colors={SHIMMER}
              end={{ x: 1, y: 0.5 }}
              start={{ x: 0, y: 0.5 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        ) : null}
        <Text style={[styles.badgeText, { color: colors.text }]}>{label}</Text>
      </LinearGradient>
    </LinearGradient>
  );
}

export function RankBadge({ rank }: { rank: ChunithmRank }) {
  if (chunithmRankUsesGradient(rank)) {
    return (
      <GradientBadge
        flowing={rank === 'SSS+'}
        label={rank}
        testID={rank === 'SSS+' ? 'flowing-chunithm-rank' : `chunithm-rank-${rank}`}
        tone="rank"
      />
    );
  }
  return (
    <View style={styles.normalBadge} testID={`chunithm-rank-${rank}`}>
      <Text style={styles.normalBadgeText}>{rank}</Text>
    </View>
  );
}

export function AchievementBadge({
  label,
  tone,
  testID,
}: {
  label: string;
  tone: ChunithmAchievementTone;
  testID: string;
}) {
  if (tone === 'neutral') {
    return (
      <View style={styles.neutralBadge} testID={testID}>
        <Text style={styles.neutralBadgeText}>{label}</Text>
      </View>
    );
  }
  return <GradientBadge label={label} testID={testID} tone={tone} />;
}

export const ChunithmScoreCard = memo(function ChunithmScoreCard({
  record,
  position,
}: {
  record: ChunithmScoreCardData;
  position?: number;
}) {
  const theme = useAppTheme();
  const scoreText = formatChunithmScore(record.score);
  const achievements = chunithmAchievementBadges(record);
  const scoreGradient = chunithmRankUsesGradient(record.rank);
  const presentation = presentChunithmScore(record, position);

  return (
    <GameScoreCard
      cardStyle={styles.card}
      mainStyle={styles.main}
      presentation={presentation}
      pressedStyle={styles.pressed}
      side={<View style={styles.ratingBlock}>
        <Text style={[styles.ratingLabel, { color: theme.textMuted }]}>Rating</Text>
        <Text style={[styles.rating, { color: record.rating === undefined ? theme.textMuted : theme.accent }]}>
          {formatChunithmRating(record.rating)}
        </Text>
      </View>}
      testID={`chunithm-score-card-${record.key}`}
      titleStyle={styles.title}
    >
        {scoreGradient ? (
          <ChunithmGradientScore flowing={record.rank === 'SSS+'} text={scoreText} />
        ) : (
          <Text style={[styles.score, { color: theme.text }]}>{scoreText}</Text>
        )}
        <View style={styles.tagRows}>
          <View style={styles.tagRow} testID={`chunithm-primary-tags-${record.key}`}>
            <ChunithmDifficultyBadge
              constant={record.difficultyConstant}
              display="label-and-value"
              level={record.level}
              levelIndex={record.levelIndex}
              worldsEndLabel={record.worldsEndLabel}
            />
            <RankBadge rank={record.rank} />
          </View>
          <View style={styles.tagRow} testID={`chunithm-achievement-tags-${record.key}`}>
            {achievements.map((achievement) => (
              <AchievementBadge
                key={achievement.id}
                label={achievement.label}
                testID={`chunithm-${achievement.id}-${achievement.tone}`}
                tone={achievement.tone}
              />
            ))}
          </View>
        </View>
    </GameScoreCard>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  pressed: { opacity: 0.72 },
  main: { flex: 1, minWidth: 0, gap: 3 },
  title: { fontSize: 15, fontWeight: '700' },
  score: { fontSize: 24, lineHeight: 30, fontWeight: '900', letterSpacing: -0.4 },
  scoreMask: { alignSelf: 'stretch', height: 30 },
  maskText: { color: '#000000' },
  flowTrack: { position: 'absolute', top: 0, bottom: 0, left: 0 },
  tagRows: { gap: 5, marginTop: 4 },
  tagRow: { minHeight: 24, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  badgeFrame: { minWidth: 32, height: 24, borderRadius: 999, padding: 2, overflow: 'hidden' },
  badgeFill: {
    flex: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(75,78,85,0.12)',
  },
  badgeText: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '900',
    letterSpacing: 0.35,
    textAlign: 'center',
    includeFontPadding: false,
  },
  normalBadge: {
    minWidth: 32,
    height: 24,
    borderRadius: 999,
    paddingHorizontal: 10,
    backgroundColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  normalBadgeText: { color: '#374151', fontSize: 10, fontWeight: '900' },
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
  ratingBlock: { minWidth: 58, alignItems: 'flex-end', gap: 2 },
  ratingLabel: { fontSize: 10, fontWeight: '700' },
  rating: { fontSize: 18, fontWeight: '900' },
});
