import { memo, useEffect, useRef, useState } from 'react';
import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { PhigrosDifficultyBadge } from './PhigrosDifficultyBadge';
import { useCachedTabActive } from '@/components/CachedTabScreen';
import type { ScoreRecord } from '@/domain/models';
import { PHIGROS_MAX_SCORE, phigrosScoreToRate } from '@/domain/phigros';
import { useAppTheme } from '@/theme/app-theme';

type GradientColors = readonly [string, string, ...string[]];

const FLOWING_PHI: GradientColors = [
  '#FFF3B0', '#F6DC7D', '#E8BF54', '#FF9CA8', '#78C8FF', '#A89CF8', '#F6DC7D', '#FFF3B0',
];
const FLOWING_FC: GradientColors = [
  '#3B82F6', '#78D29B', '#22C55E', '#78B4DC', '#3B82F6', '#78D29B', '#22C55E',
];

export const PhigrosScoreCard = memo(function PhigrosScoreCard({
  record,
  catalogTitle,
}: {
  record: ScoreRecord;
  catalogTitle?: string;
}) {
  const theme = useAppTheme();
  const score = record.dxScore ?? 0;
  const isPhi = score === PHIGROS_MAX_SCORE;
  const isFc = record.fc === 'ap' && !isPhi;
  const acc = record.achievements;
  const accText = acc % 1 === 0 ? `${acc.toFixed(0)}%` : `${acc.toFixed(2)}%`;
  const rksText = Number.isInteger(record.rating) ? record.rating.toFixed(1) : record.rating.toFixed(2);
  const rate = resolveRate(record);

  return (
    <View style={[styles.card, { backgroundColor: theme.surface }]}>
      <View style={styles.main}>
        <Text numberOfLines={1} style={[styles.title, { color: theme.text }]}>
          {catalogTitle ?? record.title}
        </Text>
        <PhigrosScoreValue
          score={score}
          variant={isPhi ? 'phi' : isFc ? 'fc' : 'normal'}
          textColor={theme.text}
        />
        <View style={styles.tags}>
          <PhigrosDifficultyBadge levelIndex={record.levelIndex} constant={record.difficultyConstant} />
          <RateBadge rate={rate} fc={record.fc === 'ap'} />
        </View>
      </View>
      <View style={styles.stats}>
        <Text style={[styles.acc, { color: theme.text }]}>{accText}</Text>
        <Text style={[styles.rks, { color: theme.accent }]}>{rksText}</Text>
      </View>
    </View>
  );
});

function PhigrosScoreValue({
  score,
  variant,
  textColor,
}: {
  score: number;
  variant: 'phi' | 'fc' | 'normal';
  textColor: string;
}) {
  const text = score.toLocaleString();
  if (variant === 'normal') {
    return <Text style={[styles.score, { color: textColor }]}>{text}</Text>;
  }

  const colors = variant === 'phi' ? FLOWING_PHI : FLOWING_FC;
  return (
    <FlowingGradientText
      colors={colors}
      duration={variant === 'phi' ? 1800 : 1400}
      testID={variant === 'phi' ? 'phigros-flowing-score-phi' : 'phigros-flowing-score-fc'}
      text={text}
    />
  );
}

function FlowingGradientText({
  text,
  colors,
  duration,
  testID,
}: {
  text: string;
  colors: GradientColors;
  duration: number;
  testID: string;
}) {
  const [width, setWidth] = useState(180);
  const progress = useFlowingProgress(duration);
  const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [-width, 0] });
  const flowingColors: GradientColors = [...colors, ...colors, colors[0]];

  return (
    <MaskedView
      accessible
      accessibilityLabel={text}
      maskElement={(
        <View style={styles.scoreMaskContent}>
          <Text style={[styles.score, styles.scoreMaskText]}>{text}</Text>
        </View>
      )}
      onLayout={(event) => setWidth(Math.max(event.nativeEvent.layout.width, 1))}
      style={styles.scoreMask}
      testID={testID}
    >
      <Animated.View style={[styles.flowTrack, { width: width * 2, transform: [{ translateX }] }]}>
        <LinearGradient
          colors={flowingColors}
          end={{ x: 1, y: 0.5 }}
          start={{ x: 0, y: 0.5 }}
          style={styles.gradientFill}
          testID={`${testID}-gradient`}
        />
      </Animated.View>
    </MaskedView>
  );
}

function useFlowingProgress(duration: number): Animated.Value {
  const progress = useRef(new Animated.Value(0)).current;
  const tabActive = useCachedTabActive();
  useEffect(() => {
    progress.setValue(0);
    if (!tabActive) return;
    const animation = Animated.loop(Animated.timing(progress, {
      toValue: 1,
      duration,
      easing: Easing.linear,
      useNativeDriver: true,
    }));
    animation.start();
    return () => animation.stop();
  }, [duration, progress, tabActive]);
  return progress;
}

type RateKind = 'f' | 'c' | 'b' | 'a' | 's' | 'v' | 'phi';

const RATE_COLORS: Record<RateKind, { bg: string; fg: string }> = {
  f: { bg: '#F3F4F6', fg: '#6B7280' },
  c: { bg: '#F3F4F6', fg: '#6B7280' },
  b: { bg: '#F3F4F6', fg: '#6B7280' },
  a: { bg: '#F3F4F6', fg: '#6B7280' },
  s: { bg: '#FDF2F8', fg: '#DB2777' },
  v: { bg: '#4B5563', fg: '#FFFFFF' },
  phi: { bg: '#FFF7E6', fg: '#B8860B' },
};

const RATE_LABELS: Record<RateKind, string> = {
  f: 'F',
  c: 'C',
  b: 'B',
  a: 'A',
  s: 'S',
  v: 'V',
  phi: '\u03C6',
};

function resolveRate(record: ScoreRecord): RateKind {
  const rate = phigrosScoreToRate(record.dxScore ?? 0, record.fc === 'ap') as RateKind;
  if (rate in RATE_LABELS) return rate;
  return 'f';
}

function RateBadge({ rate, fc }: { rate: RateKind; fc: boolean }) {
  const colors = rate === 'v' && fc
    ? { bg: '#3B82F6', fg: '#FFFFFF' }
    : RATE_COLORS[rate];
  const label = RATE_LABELS[rate];
  return (
    <View style={[styles.rateBadge, { backgroundColor: colors.bg }]}>
      <Text style={[styles.rateText, { color: colors.fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  main: { flex: 1, minWidth: 0, gap: 4 },
  title: { fontSize: 15, fontWeight: '700' },
  score: { fontSize: 24, fontWeight: '900', fontVariant: ['tabular-nums'] },
  scoreMask: { alignSelf: 'flex-start', height: 30, overflow: 'hidden' },
  scoreMaskContent: { backgroundColor: 'transparent' },
  scoreMaskText: { color: '#000000' },
  gradientFill: { ...StyleSheet.absoluteFillObject },
  flowTrack: { position: 'absolute', top: 0, bottom: 0, left: 0 },
  tags: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  stats: { minWidth: 56, alignItems: 'flex-end', gap: 4 },
  acc: { fontSize: 12, fontWeight: '700' },
  rks: { fontSize: 20, fontWeight: '900' },
  rateBadge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  rateText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.3 },
});
