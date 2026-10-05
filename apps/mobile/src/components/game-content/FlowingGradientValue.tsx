import { useState, type ReactElement } from 'react';
import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Animated,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useFlowingProgress } from './use-flowing-progress';

type GradientColors = readonly [string, string, ...string[]];
type GradientLocations = readonly [number, number, ...number[]];

const HORIZONTAL_START: { x: number; y: number } = { x: 0, y: 0.5 };
const HORIZONTAL_END: { x: number; y: number } = { x: 1, y: 0.5 };

export interface FlowingGradientState {
  width: number;
  trackWidth: number;
}

type StateStyle = StyleProp<ViewStyle> | ((state: FlowingGradientState) => StyleProp<ViewStyle>);

function resolveStateStyle(
  style: StateStyle | undefined,
  state: FlowingGradientState,
): StyleProp<ViewStyle> | undefined {
  if (style == null || typeof style !== 'function') return style;
  return style(state);
}

function FlowingGradientTrack({
  duration,
  state,
  alignTrackToContent,
  trackStyle,
  trackHeight,
  trackWrapStyle,
  colors,
  locations,
  gradientStyle,
  gradientTestID,
}: {
  duration: number;
  state: FlowingGradientState;
  alignTrackToContent: boolean;
  trackStyle?: StyleProp<ViewStyle>;
  trackHeight?: number;
  trackWrapStyle?: StateStyle;
  colors: GradientColors;
  locations?: GradientLocations;
  gradientStyle?: StateStyle;
  gradientTestID?: string;
}) {
  const progress = useFlowingProgress(true, duration);
  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [alignTrackToContent ? -state.trackWidth + state.width : -state.width, 0],
  });
  const track = (
    <Animated.View
      style={[
        trackStyle,
        {
          width: state.trackWidth,
          ...(trackHeight != null && { height: trackHeight }),
          transform: [{ translateX }],
        },
      ]}
    >
      <LinearGradient
        colors={colors}
        end={HORIZONTAL_END}
        {...(locations ? { locations } : {})}
        start={HORIZONTAL_START}
        style={resolveStateStyle(gradientStyle, state)}
        testID={gradientTestID}
      />
    </Animated.View>
  );
  const wrapStyle = resolveStateStyle(trackWrapStyle, state);
  return wrapStyle == null ? track : <View style={wrapStyle}>{track}</View>;
}

export function FlowingGradientValue({
  maskElement,
  maskStyle,
  testID,
  accessibilityLabel,
  accessible,
  androidRenderingMode,
  pointerEvents,
  measure = 'none',
  initialWidth = 0,
  measureWrapStyle,
  measureTextStyle,
  text,
  flowing = false,
  duration,
  trackMultiplier = 2,
  alignTrackToContent = false,
  trackStyle,
  trackHeight,
  trackWrapStyle,
  staticColors,
  staticLocations,
  staticStyle,
  staticTestID,
  flowingColors,
  flowingLocations,
  flowingStyle,
  flowingTestID,
}: {
  maskElement: ReactElement;
  maskStyle: StateStyle;
  testID?: string;
  accessibilityLabel?: string;
  accessible?: boolean;
  androidRenderingMode?: 'software' | 'hardware';
  pointerEvents?: 'auto' | 'none' | 'box-none' | 'box-only';
  measure?: 'mask-layout' | 'hidden-text' | 'none';
  initialWidth?: number;
  measureWrapStyle?: StyleProp<ViewStyle>;
  measureTextStyle?: StyleProp<TextStyle>;
  text?: string;
  flowing?: boolean;
  duration?: number;
  trackMultiplier?: number;
  alignTrackToContent?: boolean;
  trackStyle?: StyleProp<ViewStyle>;
  trackHeight?: number;
  trackWrapStyle?: StateStyle;
  staticColors?: GradientColors;
  staticLocations?: GradientLocations;
  staticStyle?: StyleProp<ViewStyle>;
  staticTestID?: string;
  flowingColors?: GradientColors;
  flowingLocations?: GradientLocations;
  flowingStyle?: StateStyle;
  flowingTestID?: string;
}) {
  const [width, setWidth] = useState(initialWidth);
  const measured = Math.max(width, 1);
  const state: FlowingGradientState = { width: measured, trackWidth: measured * trackMultiplier };

  const handleMaskLayout = measure === 'mask-layout'
    ? (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)
    : undefined;
  const handleTextLayout = (event: LayoutChangeEvent) => {
    /** 向上取整并忽略 0 宽抖动。 */
    const next = Math.ceil(event.nativeEvent.layout.width);
    if (next > 0 && next !== width) setWidth(next);
  };

  const masked = (
    <MaskedView
      accessible={accessible}
      accessibilityLabel={accessibilityLabel}
      androidRenderingMode={androidRenderingMode}
      maskElement={maskElement}
      onLayout={handleMaskLayout}
      pointerEvents={pointerEvents}
      style={resolveStateStyle(maskStyle, state)}
      testID={testID}
    >
      {flowing && flowingColors ? (
        <FlowingGradientTrack
          alignTrackToContent={alignTrackToContent}
          colors={flowingColors}
          duration={duration ?? 0}
          gradientStyle={flowingStyle}
          gradientTestID={flowingTestID}
          locations={flowingLocations}
          state={state}
          trackHeight={trackHeight}
          trackStyle={trackStyle}
          trackWrapStyle={trackWrapStyle}
        />
      ) : staticColors ? (
        <LinearGradient
          colors={staticColors}
          end={HORIZONTAL_END}
          {...(staticLocations ? { locations: staticLocations } : {})}
          start={HORIZONTAL_START}
          style={staticStyle}
          testID={staticTestID}
        />
      ) : null}
    </MaskedView>
  );

  if (measure === 'hidden-text') {
    return (
      <View style={measureWrapStyle}>
        <Text onLayout={handleTextLayout} pointerEvents="none" style={measureTextStyle}>{text}</Text>
        {masked}
      </View>
    );
  }
  return masked;
}
