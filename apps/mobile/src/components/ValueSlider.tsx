import { useRef, useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import {
  StyleSheet,
  View,
  type AccessibilityActionEvent,
  type AccessibilityValue,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from 'react-native';
import { useAppTheme } from '@/theme/app-theme';

export const SLIDER_VISUAL_STYLES = StyleSheet.create({
  hitTrack: { height: 36, justifyContent: 'center', marginHorizontal: 10 },
  track: { height: 4, borderRadius: 2 },
  activeTrack: { position: 'absolute', height: 4, borderRadius: 2 },
  thumb: {
    position: 'absolute',
    width: 22,
    height: 22,
    marginLeft: -11,
    borderRadius: 11,
    borderWidth: 2,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.16,
    shadowRadius: 2,
    elevation: 2,
  },
});

export function ValueSlider({
  accessibilityLabel,
  accessibilityValue,
  colors,
  min,
  max,
  step,
  value,
  onChange,
  onChangeComplete,
}: {
  accessibilityLabel: string;
  accessibilityValue?: AccessibilityValue;
  colors: readonly string[];
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  onChangeComplete?: (value: number) => void;
}) {
  const theme = useAppTheme();
  const [width, setWidth] = useState(1);
  const latestValue = useRef(value);
  latestValue.current = value;
  const range = Math.max(max - min, step);
  const normalized = Math.max(0, Math.min(1, (value - min) / range));
  const commit = (raw: number) => {
    const stepped = min + Math.round((raw - min) / step) * step;
    const next = Math.max(min, Math.min(max, stepped));
    if (next !== latestValue.current) {
      latestValue.current = next;
      onChange(next);
    }
    return next;
  };
  const updateFromEvent = (event: GestureResponderEvent) => {
    const position = Math.max(0, Math.min(1, event.nativeEvent.locationX / Math.max(width, 1)));
    commit(min + position * range);
  };
  const adjust = (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === 'increment') onChangeComplete?.(commit(value + step));
    if (event.nativeEvent.actionName === 'decrement') onChangeComplete?.(commit(value - step));
  };
  const complete = (event: GestureResponderEvent) => {
    updateFromEvent(event);
    onChangeComplete?.(latestValue.current);
  };

  return (
    <View
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="adjustable"
      accessibilityValue={accessibilityValue ?? { min, max, now: value }}
      onAccessibilityAction={adjust}
      onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={updateFromEvent}
      onResponderMove={updateFromEvent}
      onResponderRelease={complete}
      onResponderTerminate={complete}
      onStartShouldSetResponder={() => true}
      style={SLIDER_VISUAL_STYLES.hitTrack}
    >
      <View pointerEvents="none" style={[SLIDER_VISUAL_STYLES.track, { backgroundColor: theme.border }]}>
        <LinearGradient
          colors={colors as [string, string, ...string[]]}
          end={{ x: 1, y: 0.5 }}
          pointerEvents="none"
          start={{ x: 0, y: 0.5 }}
          style={StyleSheet.absoluteFillObject}
        />
      </View>
      <View
        pointerEvents="none"
        style={[
          SLIDER_VISUAL_STYLES.thumb,
          { backgroundColor: theme.surface, borderColor: theme.accent, left: `${normalized * 100}%` },
        ]}
      />
    </View>
  );
}
