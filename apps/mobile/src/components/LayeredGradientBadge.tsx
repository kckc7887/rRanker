import { useEffect, useRef, useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Animated,
  Easing,
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
} from '@/features/best-image/best-image-badge-theme';
import { useCachedTabActive } from '@/components/CachedTabScreen';

type LayeredGradientBadgeTone = 'rainbow' | 'gold';
type GradientColors = readonly [string, string, ...string[]];

const SHIMMER: GradientColors = [
  'rgba(255,255,255,0)', 'rgba(255,255,255,0.22)', 'rgba(255,255,255,0)',
];

function colorsFor(tone: LayeredGradientBadgeTone): {
  border: GradientColors;
  fill: GradientColors;
} {
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
  tone: LayeredGradientBadgeTone;
  flowing?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  const colors = colorsFor(tone);
  const tabActive = useCachedTabActive();
  const [width, setWidth] = useState(52);
  const progress = useRef(new Animated.Value(0)).current;
  const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [-width, 0] });

  useEffect(() => {
    progress.setValue(0);
    if (!flowing || !tabActive) return;
    const animation = Animated.loop(Animated.timing(progress, {
      toValue: 1,
      duration: 1_400,
      easing: Easing.linear,
      useNativeDriver: true,
    }));
    animation.start();
    return () => animation.stop();
  }, [flowing, progress, tabActive]);

  return (
    <LinearGradient
      colors={colors.border}
      end={{ x: 1, y: 0.5 }}
      start={{ x: 0, y: 0.5 }}
      style={[styles.frame, style]}
      testID={testID}
    >
      <LinearGradient
        colors={colors.fill}
        end={{ x: 1, y: 0.5 }}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        start={{ x: 0, y: 0.5 }}
        style={[styles.content, contentStyle]}
      >
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.overlay]} />
        {flowing ? (
          <Animated.View
            pointerEvents="none"
            style={[styles.flowTrack, { width: width * 2, transform: [{ translateX }] }]}
          >
            <LinearGradient
              colors={SHIMMER}
              end={{ x: 1, y: 0.5 }}
              start={{ x: 0, y: 0.5 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        ) : null}
        <Text
          numberOfLines={numberOfLines}
          style={[styles.text, textStyle]}
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
  overlay: { backgroundColor: BADGE_LAYER_OVERLAY },
  flowTrack: { position: 'absolute', top: 0, bottom: 0, left: 0 },
  text: { color: BEST_IMAGE_RAINBOW_TEXT, textAlign: 'center' },
});
