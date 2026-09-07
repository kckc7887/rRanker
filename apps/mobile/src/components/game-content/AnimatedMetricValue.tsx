import { StyleSheet, Text, View } from 'react-native';
import { FlowingGradientValue } from './FlowingGradientValue';
type GradientColors = readonly [string, string, ...string[]];
const FLOW_GRADIENT_REPEATS = 3;
const DEFAULT_LINE_HEIGHT = 32;
const DEFAULT_FONT_SIZE = 24;

export function AnimatedMetricValue({
  text,
  gradient,
  textColor,
  fontSize = DEFAULT_FONT_SIZE,
  lineHeight = DEFAULT_LINE_HEIGHT,
  accessibilityLabel,
}: {
  text: string;
  gradient?: { colors: GradientColors; duration: number; testID: string };
  textColor: string;
  fontSize?: number;
  lineHeight?: number;
  accessibilityLabel?: string;
}) {
  const textStyle = [styles.score, { fontSize, lineHeight }];
  if (!gradient) {
    return (
      <Text accessibilityLabel={accessibilityLabel ?? text} style={[...textStyle, { color: textColor }]}>
        {text}
      </Text>
    );
  }

  return (
    <FlowingGradientText
      colors={gradient.colors}
      duration={gradient.duration}
      fontSize={fontSize}
      lineHeight={lineHeight}
      testID={gradient.testID}
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
  const textStyle = [styles.score, { fontSize, lineHeight }];

  return (
    <FlowingGradientValue
      accessible
      accessibilityLabel={accessibilityLabel}
      duration={duration}
      flowing
      initialWidth={120}
      maskElement={(
        <View style={styles.scoreMaskRoot}>
          <Text style={[...textStyle, styles.scoreMaskText]}>{text}</Text>
        </View>
      )}
      maskStyle={(state) => [styles.scoreMask, { width: state.width, height: lineHeight }]}
      measure="hidden-text"
      measureTextStyle={[...textStyle, styles.scoreMeasure]}
      measureWrapStyle={styles.scoreMeasureWrap}
      text={text}
      testID={testID}
      alignTrackToContent
      trackHeight={lineHeight}
      trackMultiplier={FLOW_GRADIENT_REPEATS}
      trackStyle={styles.flowTrack}
      trackWrapStyle={(state) => ({ width: state.width, height: lineHeight })}
      flowingColors={colors}
      flowingStyle={(state) => ({ width: state.trackWidth, height: lineHeight })}
      flowingTestID={`${testID}-gradient`}
    />
  );
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
