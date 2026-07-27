import { memo, useEffect, useRef, useState } from 'react';
import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import { router, type Href } from 'expo-router';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
} from 'react-native';
import { ChunithmDifficultyBadge } from './ChunithmDifficultyBadge';
import { useCachedTabActive } from '@/components/CachedTabScreen';
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

type GradientColors = readonly [string, string, ...string[]];
type GradientLocations = readonly [number, number, ...number[]];

export const CHUNITHM_RANK_GRADIENT: GradientColors = [
  '#73CFFF', '#EFCB63', '#FF8EC8',
];
export const CHUNITHM_RANK_GRADIENT_LOCATIONS: GradientLocations = [0, 0.38, 1];
const FLOWING_RANK_GRADIENT: GradientColors = [
  ...CHUNITHM_RANK_GRADIENT, ...CHUNITHM_RANK_GRADIENT, CHUNITHM_RANK_GRADIENT[0],
];
const FLOWING_RANK_LOCATIONS: GradientLocations = [
  0, 0.19, 0.5, 0.501, 0.69, 0.999, 1,
];

const BADGE_TONES: Record<Exclude<ChunithmAchievementTone, 'neutral'> | 'rank', {
  border: GradientColors;
  fill: GradientColors;
  locations?: GradientLocations;
  text: string;
}> = {
  rank: {
    border: ['#287DA8', '#8C6A14', '#A84F82'],
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

function useFlowingProgress(enabled: boolean, duration = 1_400): Animated.Value {
  const progress = useRef(new Animated.Value(0)).current;
  const tabActive = useCachedTabActive();
  useEffect(() => {
    progress.setValue(0);
    if (!enabled || !tabActive) return;
    const animation = Animated.loop(Animated.timing(progress, {
      toValue: 1,
      duration,
      easing: Easing.linear,
      useNativeDriver: true,
    }));
    animation.start();
    return () => animation.stop();
  }, [duration, enabled, progress, tabActive]);
  return progress;
}

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
            colors={FLOWING_RANK_GRADIENT}
            end={{ x: 1, y: 0.5 }}
            locations={FLOWING_RANK_LOCATIONS}
            start={{ x: 0, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      ) : (
        <LinearGradient
          colors={CHUNITHM_RANK_GRADIENT}
          end={{ x: 1, y: 0.5 }}
          locations={CHUNITHM_RANK_GRADIENT_LOCATIONS}
          start={{ x: 0, y: 0.5 }}
          style={StyleSheet.absoluteFill}
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
  const progress = useFlowingProgress(flowing);
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

  return (
    <Pressable
      accessibilityLabel={`${record.title}，分数 ${scoreText}，评价 ${record.rank}，Rating ${formatChunithmRating(record.rating)}`}
      accessibilityRole="button"
      onPress={() => router.push({
        pathname: '/songs/[songId]',
        params: { songId: record.songId, levelIndex: String(record.levelIndex) },
      } as Href)}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: theme.surface },
        pressed && styles.pressed,
      ]}
      testID={`chunithm-score-card-${record.key}`}
    >
      <View style={styles.main}>
        <Text numberOfLines={1} style={[styles.title, { color: theme.text }]}>
          {position ? `${position}. ` : ''}{record.title}
        </Text>
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
      </View>
      <View style={styles.ratingBlock}>
        <Text style={[styles.ratingLabel, { color: theme.textMuted }]}>Rating</Text>
        <Text style={[styles.rating, { color: record.rating === undefined ? theme.textMuted : theme.accent }]}>
          {formatChunithmRating(record.rating)}
        </Text>
      </View>
    </Pressable>
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
