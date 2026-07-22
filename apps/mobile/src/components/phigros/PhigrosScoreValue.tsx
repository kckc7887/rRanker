import { useEffect, useRef, useState } from 'react';
import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { useCachedTabActive } from '@/components/CachedTabScreen';

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
const DEFAULT_LINE_HEIGHT = 32;
const DEFAULT_FONT_SIZE = 24;

function buildFlowingColors(base: GradientColors): GradientColors {
  const repeated = Array.from({ length: FLOW_GRADIENT_REPEATS }, () => [...base]).flat();
  return [...repeated, base[0]] as unknown as GradientColors;
}

const FLOWING_PHI = buildFlowingColors(PHI_BASE);
const FLOWING_FC = buildFlowingColors(FC_BASE);

export function PhigrosScoreValue({
  score,
  variant,
  textColor,
  fontSize = DEFAULT_FONT_SIZE,
  lineHeight = DEFAULT_LINE_HEIGHT,
  accessibilityLabel,
}: {
  score: number;
  variant: 'phi' | 'fc' | 'normal';
  textColor: string;
  fontSize?: number;
  lineHeight?: number;
  accessibilityLabel?: string;
}) {
  const text = score.toLocaleString();
  const textStyle = [styles.score, { fontSize, lineHeight }];
  if (variant === 'normal') {
    return (
      <Text accessibilityLabel={accessibilityLabel ?? text} style={[...textStyle, { color: textColor }]}>
        {text}
      </Text>
    );
  }

  const colors = variant === 'phi' ? FLOWING_PHI : FLOWING_FC;
  return (
    <FlowingGradientText
      colors={colors}
      duration={variant === 'phi' ? FLOW_DURATION_PHI_MS : FLOW_DURATION_FC_MS}
      fontSize={fontSize}
      lineHeight={lineHeight}
      testID={variant === 'phi' ? 'phigros-flowing-score-phi' : 'phigros-flowing-score-fc'}
      text={text}
      accessibilityLabel={accessibilityLabel ?? text}
    />
  );
}

function FlowingGradientText({
  text,
  colors,
  duration,
  fontSize,
  lineHeight,
  testID,
  accessibilityLabel,
}: {
  text: string;
  colors: GradientColors;
  duration: number;
  fontSize: number;
  lineHeight: number;
  testID: string;
  accessibilityLabel: string;
}) {
  const [width, setWidth] = useState(120);
  const progress = useFlowingProgress(duration);
  const measuredWidth = Math.max(width, 1);
  const trackWidth = measuredWidth * FLOW_GRADIENT_REPEATS;
  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-trackWidth + measuredWidth, 0],
  });
  const textStyle = [styles.score, { fontSize, lineHeight }];

  return (
    <View style={styles.scoreMeasureWrap}>
      <Text
        pointerEvents="none"
        style={[...textStyle, styles.scoreMeasure]}
        onLayout={(event) => {
          const next = Math.ceil(event.nativeEvent.layout.width);
          if (next > 0 && next !== width) setWidth(next);
        }}
      >
        {text}
      </Text>
      <MaskedView
        accessible
        accessibilityLabel={accessibilityLabel}
        maskElement={(
          <View style={styles.scoreMaskRoot}>
            <Text style={[...textStyle, styles.scoreMaskText]}>{text}</Text>
          </View>
        )}
        style={[styles.scoreMask, { width: measuredWidth, height: lineHeight }]}
        testID={testID}
      >
        <View style={{ width: measuredWidth, height: lineHeight }}>
          <Animated.View
            style={[
              styles.flowTrack,
              {
                width: trackWidth,
                height: lineHeight,
                transform: [{ translateX }],
              },
            ]}
          >
            <LinearGradient
              colors={colors}
              end={{ x: 1, y: 0.5 }}
              start={{ x: 0, y: 0.5 }}
              style={{ width: trackWidth, height: lineHeight }}
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

const styles = StyleSheet.create({
  score: {
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
  },
  scoreMask: {},
  scoreMeasureWrap: { alignSelf: 'flex-start' },
  scoreMeasure: { position: 'absolute', opacity: 0, left: 0, top: 0 },
  scoreMaskRoot: { backgroundColor: 'transparent', justifyContent: 'center' },
  scoreMaskText: { color: '#000000' },
  flowTrack: { position: 'absolute', top: 0, left: 0 },
});
