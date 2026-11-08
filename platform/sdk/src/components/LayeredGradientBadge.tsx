import { useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Animated,
  StyleSheet,
  Text,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
  View,
} from 'react-native';
import {
  BADGE_GOLD_BORDER_COLORS,
  BADGE_GOLD_FILL_COLORS,
  BADGE_LAYER_OVERLAY,
  BADGE_RAINBOW_BORDER_COLORS,
  BADGE_RAINBOW_FILL_COLORS,
  BEST_IMAGE_RAINBOW_TEXT,
} from '@rranker/sdk/domain/badge-theme';
import { useFlowingProgress } from '@rranker/sdk/components/game-content/use-flowing-progress';

type GradientColors = readonly [string, string, ...string[]];

const SHIMMER: GradientColors = [
  'rgba(255,255,255,0)', 'rgba(255,255,255,0.22)', 'rgba(255,255,255,0)',
];

type BadgeGradient = {
  border: GradientColors;
  fill: GradientColors;
  text?: string;
  locations?: readonly [number, number, ...number[]];
  overlay?: string | null;
  shimmer?: GradientColors;
};

function colorsFor(tone: 'rainbow' | 'gold' | BadgeGradient): BadgeGradient {
  if (typeof tone === 'object') return tone;
  return tone === 'rainbow'
    ? { border: BADGE_RAINBOW_BORDER_COLORS, fill: BADGE_RAINBOW_FILL_COLORS }
    : { border: BADGE_GOLD_BORDER_COLORS, fill: BADGE_GOLD_FILL_COLORS };
}

export function LayeredGradientBadge({
  label,
  tone,
  flowing = false,
  testID,
  style,
  contentStyle,
  textStyle,
  numberOfLines,
}: {
  label: string;
  tone: 'rainbow' | 'gold' | BadgeGradient;
  flowing?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  const colors = colorsFor(tone);
  const [width, setWidth] = useState(52);
  const progress = useFlowingProgress(flowing, 1_400);
  const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [-width, 0] });

  return (
    <LinearGradient
      colors={colors.border}
      locations={colors.locations}
      end={{ x: 1, y: 0.5 }}
      start={{ x: 0, y: 0.5 }}
      style={[styles.frame, style]}
      testID={testID}
    >
      <LinearGradient
        colors={colors.fill}
        locations={colors.locations}
        end={{ x: 1, y: 0.5 }}
        onLayout={flowing ? (event) => setWidth(event.nativeEvent.layout.width) : undefined}
        start={{ x: 0, y: 0.5 }}
        style={[styles.content, contentStyle]}
      >
        {colors.overlay !== null && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay ?? BADGE_LAYER_OVERLAY }]} />}
        {flowing ? (
          <Animated.View
            pointerEvents="none"
            style={[styles.flowTrack, { width: width * 2, transform: [{ translateX }] }]}
          >
            <LinearGradient
              colors={colors.shimmer ?? SHIMMER}
              end={{ x: 1, y: 0.5 }}
              start={{ x: 0, y: 0.5 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        ) : null}
        <Text
          numberOfLines={numberOfLines}
          style={[styles.text, colors.text ? { color: colors.text } : undefined, textStyle]}
        >
          {label}
        </Text>
      </LinearGradient>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  frame: { padding: 2, borderRadius: 999, overflow: 'hidden' },
  content: {
    flex: 1,
    width: '100%',
    borderRadius: 999,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  flowTrack: { position: 'absolute', top: 0, bottom: 0, left: 0 },
  text: { color: BEST_IMAGE_RAINBOW_TEXT, textAlign: 'center' },
});
