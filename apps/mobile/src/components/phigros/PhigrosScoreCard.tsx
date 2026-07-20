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

/** V08 薄荷苏打：φ 蜂蜜金 / FC 薄荷天蓝 */
const PHI_BASE: GradientColors = [
  '#F5D76E', '#FDE68A', '#FBBF24', '#FCD34D', '#F59E0B', '#E8A317',
];
const FC_BASE: GradientColors = [
  '#38BDF8', '#6EE7B7', '#2DD4BF', '#7DD3FC', '#34D399',
];

const FLOW_GRADIENT_REPEATS = 3;
const FLOW_DURATION_PHI_MS = 3000;
const FLOW_DURATION_FC_MS = 2400;

function buildFlowingColors(base: GradientColors): GradientColors {
  const repeated = Array.from({ length: FLOW_GRADIENT_REPEATS }, () => [...base]).flat();
  return [...repeated, base[0]] as GradientColors;
}

const FLOWING_PHI = buildFlowingColors(PHI_BASE);
const FLOWING_FC = buildFlowingColors(FC_BASE);

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

const SCORE_LINE_HEIGHT = 32;

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
      duration={variant === 'phi' ? FLOW_DURATION_PHI_MS : FLOW_DURATION_FC_MS}
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
  const [width, setWidth] = useState(120);
  const progress = useFlowingProgress(duration);
  const measuredWidth = Math.max(width, 1);
  const trackWidth = measuredWidth * FLOW_GRADIENT_REPEATS;
  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-trackWidth + measuredWidth, 0],
  });

  return (
    <View style={styles.scoreMeasureWrap}>
      <Text
        pointerEvents="none"
        style={[styles.score, styles.scoreMeasure]}
        onLayout={(event) => {
          const next = Math.ceil(event.nativeEvent.layout.width);
          if (next > 0 && next !== width) setWidth(next);
        }}
      >
        {text}
      </Text>
      <MaskedView
        accessible
        accessibilityLabel={text}
        maskElement={(
          <View style={styles.scoreMaskRoot}>
            <Text style={[styles.score, styles.scoreMaskText]}>{text}</Text>
          </View>
        )}
        style={[styles.scoreMask, { width: measuredWidth }]}
        testID={testID}
      >
        <View style={{ width: measuredWidth, height: SCORE_LINE_HEIGHT }}>
          <Animated.View
            style={[
              styles.flowTrack,
              {
                width: trackWidth,
                height: SCORE_LINE_HEIGHT,
                transform: [{ translateX }],
              },
            ]}
          >
            <LinearGradient
              colors={colors}
              end={{ x: 1, y: 0.5 }}
              start={{ x: 0, y: 0.5 }}
              style={{ width: trackWidth, height: SCORE_LINE_HEIGHT }}
              testID={`${testID}-gradient`}
            />
          </Animated.View>
        </View>
      </MaskedView>
    </View>
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
  const isBlueV = rate === 'v' && fc;
  const colors = isBlueV
    ? { bg: '#FFFFFF', fg: '#0EA5E9' }
    : RATE_COLORS[rate];
  const label = RATE_LABELS[rate];
  return (
    <View style={[
      styles.rateBadge,
      { backgroundColor: colors.bg },
      isBlueV && styles.rateBadgeBlueV,
    ]}>
      <Text style={[styles.rateText, { color: colors.fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  main: { flex: 1, minWidth: 0, gap: 4 },
  title: { fontSize: 15, fontWeight: '700' },
  score: {
    fontSize: 24,
    lineHeight: SCORE_LINE_HEIGHT,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
  },
  scoreMask: { height: SCORE_LINE_HEIGHT },
  scoreMeasureWrap: { alignSelf: 'flex-start' },
  scoreMeasure: { position: 'absolute', opacity: 0, left: 0, top: 0 },
  scoreMaskRoot: { backgroundColor: 'transparent', justifyContent: 'center' },
  scoreMaskText: { color: '#000000' },
  flowTrack: { position: 'absolute', top: 0, left: 0 },
  tags: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  stats: { minWidth: 56, alignItems: 'flex-end', gap: 4 },
  acc: { fontSize: 12, fontWeight: '700' },
  rks: { fontSize: 20, fontWeight: '900' },
  rateBadge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  rateBadgeBlueV: { borderWidth: 1, borderColor: '#BFDBFE' },
  rateText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.3 },
});
