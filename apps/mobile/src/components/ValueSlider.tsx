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
  inverted = false,
  min,
  max,
  step,
  value,
  onChange,
  onChangeComplete,
}: {
  accessibilityLabel: string;
  accessibilityValue?: AccessibilityValue;
  colors?: readonly string[];
  inverted?: boolean;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  onChangeComplete?: (value: number) => void;
}) {
  const theme = useAppTheme();
  const [width, setWidth] = useState(1);
  const controlledValue = Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : min;
  const latestValue = useRef(controlledValue);
  const dragStart = useRef({ pageX: null as number | null, value: controlledValue });
  latestValue.current = controlledValue;
  const range = Math.max(max - min, step);
  const normalized = Math.max(0, Math.min(1, (controlledValue - min) / range));
  const position = inverted ? 1 - normalized : normalized;
  const commit = (raw: number) => {
    if (!Number.isFinite(raw)) return latestValue.current;
    const stepped = min + Math.round((raw - min) / step) * step;
    const next = Math.max(min, Math.min(max, stepped));
    if (next !== latestValue.current) {
      latestValue.current = next;
      onChange(next);
    }
    return next;
  };
  const updateFromPosition = (locationX: number) => {
    if (!Number.isFinite(locationX)) return latestValue.current;
    const ratio = Math.max(0, Math.min(1, locationX / Math.max(width, 1)));
    return commit(inverted ? max - ratio * range : min + ratio * range);
  };
  const begin = (event: GestureResponderEvent) => {
    const next = updateFromPosition(event.nativeEvent.locationX);
    dragStart.current = {
      pageX: Number.isFinite(event.nativeEvent.pageX) ? event.nativeEvent.pageX : null,
      value: next,
    };
  };
  const updateFromEvent = (event: GestureResponderEvent) => {
    const pageX = event.nativeEvent.pageX;
    if (dragStart.current.pageX !== null && Number.isFinite(pageX)) {
      const delta = (pageX - dragStart.current.pageX) / Math.max(width, 1) * range;
      commit(dragStart.current.value + (inverted ? -delta : delta));
      return;
    }
    updateFromPosition(event.nativeEvent.locationX);
  };
  const adjust = (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === 'increment') onChangeComplete?.(commit(controlledValue + step));
    if (event.nativeEvent.actionName === 'decrement') onChangeComplete?.(commit(controlledValue - step));
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
      accessibilityValue={accessibilityValue ?? { min, max, now: controlledValue }}
      onAccessibilityAction={adjust}
      onLayout={(event: LayoutChangeEvent) => {
        const nextWidth = event.nativeEvent.layout.width;
        if (Number.isFinite(nextWidth) && nextWidth > 0) setWidth(nextWidth);
      }}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={begin}
      onResponderMove={updateFromEvent}
      onResponderRelease={complete}
      onResponderTerminate={complete}
      onStartShouldSetResponder={() => true}
      style={SLIDER_VISUAL_STYLES.hitTrack}
    >
      <View pointerEvents="none" style={[SLIDER_VISUAL_STYLES.track, { backgroundColor: theme.border }]}>
        {colors ? (
          <LinearGradient
            colors={colors as [string, string, ...string[]]}
            end={{ x: 1, y: 0.5 }}
            pointerEvents="none"
            start={{ x: 0, y: 0.5 }}
            style={StyleSheet.absoluteFillObject}
          />
        ) : null}
      </View>
      {colors ? null : (
        <View
          pointerEvents="none"
          style={[
            SLIDER_VISUAL_STYLES.activeTrack,
            inverted
              ? { backgroundColor: theme.accent, left: `${position * 100}%`, right: 0 }
              : { backgroundColor: theme.accent, left: 0, right: `${(1 - position) * 100}%` },
          ]}
        />
      )}
      <View
        pointerEvents="none"
        style={[
          SLIDER_VISUAL_STYLES.thumb,
          { backgroundColor: theme.surface, borderColor: theme.accent, left: `${position * 100}%` },
        ]}
      />
    </View>
  );
}
