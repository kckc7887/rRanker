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
      style={styles.track}
    >
      <LinearGradient
        colors={colors as [string, string, ...string[]]}
        end={{ x: 1, y: 0.5 }}
        pointerEvents="none"
        start={{ x: 0, y: 0.5 }}
        style={StyleSheet.absoluteFillObject}
      />
      <View pointerEvents="none" style={[styles.thumb, { left: Math.max(0, Math.min(width - 18, normalized * width - 9)) }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 28,
    borderRadius: 14,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  thumb: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#FFF',
    borderWidth: 2,
    borderColor: 'rgba(17,24,39,0.35)',
  },
});
