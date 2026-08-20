import { useCallback, useMemo, useRef, useState } from 'react';
import {
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  type AccessibilityActionEvent,
  type LayoutChangeEvent,
} from 'react-native';
import { normalizeNumericInput } from '@/utils/numeric-input';
import { useAppTheme } from '@/theme/app-theme';

export type RangeBounds = { minimum: number; maximum: number };

export type RangeSelectorProps = RangeBounds & {
  step: number;
  lowerValue: string;
  upperValue: string;
  onLowerValueChange: (value: string) => void;
  onUpperValueChange: (value: string) => void;
  formatValue?: (value: number) => string;
  accessibilityLabel: string;
  testID?: string;
};

function finiteInput(value: string): number | null {
  const normalized = normalizeNumericInput(value);
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function decimalPlaces(step: number): number {
  const text = String(step);
  if (text.includes('e-')) return Number(text.split('e-')[1]) || 0;
  return text.includes('.') ? text.length - text.indexOf('.') - 1 : 0;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function snapRangeValue(value: number, minimum: number, maximum: number, step: number): number {
  const safeStep = Number.isFinite(step) && step > 0 ? step : 1;
  const snapped = minimum + Math.round((value - minimum) / safeStep) * safeStep;
  return Number(clamp(snapped, minimum, maximum).toFixed(decimalPlaces(safeStep) + 2));
}

export function serializeRangeValue(
  value: number,
  boundary: number,
  step: number,
  kind: 'lower' | 'upper',
): string {
  if ((kind === 'lower' && value <= boundary) || (kind === 'upper' && value >= boundary)) return '';
  const fixed = value.toFixed(decimalPlaces(step));
  return fixed.includes('.') ? fixed.replace(/0+$/u, '').replace(/\.$/u, '') : fixed;
}

export function rangeValueForDrag(
  start: number,
  deltaX: number,
  trackWidth: number,
  minimum: number,
  maximum: number,
): number {
  if (trackWidth <= 0) return start;
  return start + (deltaX / trackWidth) * (maximum - minimum);
}

/**
 * 从当前未筛选数据建立边界，并在同一 resetKey 生命周期内只扩不缩。
 * 已有筛选值会参与扩边，避免被静默钳制；无数据时才使用 fallback。
 */
export function useStableRangeBounds(
  values: readonly number[],
  fallback: RangeBounds,
  lowerValue = '',
  upperValue = '',
  resetKey: string | number = 'default',
): RangeBounds {
  const validValues = values.filter((value) => Number.isFinite(value));
  const lower = finiteInput(lowerValue);
  const upper = finiteInput(upperValue);
  const candidates = [...validValues, ...(lower == null ? [] : [lower]), ...(upper == null ? [] : [upper])];
  const current = candidates.length > 0
    ? { minimum: Math.min(...candidates), maximum: Math.max(...candidates) }
    : fallback;
  const ref = useRef<{ key: string | number; bounds: RangeBounds }>({ key: resetKey, bounds: current });
  if (ref.current.key !== resetKey) ref.current = { key: resetKey, bounds: current };
  else ref.current.bounds = {
    minimum: Math.min(ref.current.bounds.minimum, current.minimum),
    maximum: Math.max(ref.current.bounds.maximum, current.maximum),
  };
  if (ref.current.bounds.minimum === ref.current.bounds.maximum) {
    ref.current.bounds = {
      minimum: ref.current.bounds.minimum,
      maximum: ref.current.bounds.maximum + 1,
    };
  }
  return ref.current.bounds;
}

export function RangeSelector({
  minimum,
  maximum,
  step,
  lowerValue,
  upperValue,
  onLowerValueChange,
  onUpperValueChange,
  formatValue = (value) => String(value),
  accessibilityLabel,
  testID,
}: RangeSelectorProps) {
  const theme = useAppTheme();
  const [trackWidth, setTrackWidth] = useState(0);
  const range = Math.max(maximum - minimum, Number.EPSILON);
  const lower = clamp(finiteInput(lowerValue) ?? minimum, minimum, maximum);
  const upper = clamp(finiteInput(upperValue) ?? maximum, lower, maximum);
  const lowerRatio = (lower - minimum) / range;
  const upperRatio = (upper - minimum) / range;

  const writeLower = useCallback((value: number) => {
    const next = Math.min(snapRangeValue(value, minimum, maximum, step), upper);
    onLowerValueChange(serializeRangeValue(next, minimum, step, 'lower'));
  }, [maximum, minimum, onLowerValueChange, step, upper]);
  const writeUpper = useCallback((value: number) => {
    const next = Math.max(snapRangeValue(value, minimum, maximum, step), lower);
    onUpperValueChange(serializeRangeValue(next, maximum, step, 'upper'));
  }, [lower, maximum, minimum, onUpperValueChange, step]);

  const lowerStart = useRef(lower);
  const upperStart = useRef(upper);
  const lowerResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 4 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
    onPanResponderGrant: () => { lowerStart.current = lower; },
    onPanResponderMove: (_, gesture) => {
      writeLower(rangeValueForDrag(lowerStart.current, gesture.dx, trackWidth, minimum, maximum));
    },
  // Controlled values must rebuild responders so crossing constraints always use the latest endpoint.
  }), [lower, maximum, minimum, trackWidth, writeLower]);
  const upperResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 4 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
    onPanResponderGrant: () => { upperStart.current = upper; },
    onPanResponderMove: (_, gesture) => {
      writeUpper(rangeValueForDrag(upperStart.current, gesture.dx, trackWidth, minimum, maximum));
    },
  }), [maximum, minimum, trackWidth, upper, writeUpper]);

  const handleTrackPress = (locationX: number) => {
    if (trackWidth <= 0) return;
    const next = snapRangeValue(minimum + (locationX / trackWidth) * range, minimum, maximum, step);
    if (Math.abs(next - lower) <= Math.abs(next - upper)) writeLower(next);
    else writeUpper(next);
  };
  const handleAccessibility = (kind: 'lower' | 'upper') => (event: AccessibilityActionEvent) => {
    const delta = event.nativeEvent.actionName === 'increment' ? step
      : event.nativeEvent.actionName === 'decrement' ? -step : 0;
    if (delta === 0) return;
    if (kind === 'lower') writeLower(lower + delta);
    else writeUpper(upper + delta);
  };
  const onLayout = (event: LayoutChangeEvent) => setTrackWidth(event.nativeEvent.layout.width);

  return (
    <View accessibilityLabel={accessibilityLabel} style={styles.root} testID={testID}>
      <View style={styles.values}>
        <Text style={[styles.value, { color: theme.text }]}>{formatValue(lower)}</Text>
        <Text style={[styles.separator, { color: theme.textMuted }]}>—</Text>
        <Text style={[styles.value, { color: theme.text }]}>{formatValue(upper)}</Text>
      </View>
      <Pressable
        accessible={false}
        onLayout={onLayout}
        onPress={(event) => handleTrackPress(event.nativeEvent.locationX)}
        style={styles.hitTrack}
        testID={testID ? `${testID}-track` : undefined}
      >
        <View style={[styles.track, { backgroundColor: theme.border }]} />
        <View style={[styles.activeTrack, {
          backgroundColor: theme.accent,
          left: `${lowerRatio * 100}%`,
          right: `${(1 - upperRatio) * 100}%`,
        }]} />
        <View
          accessible
          accessibilityActions={[{ name: 'decrement' }, { name: 'increment' }]}
          accessibilityLabel={`${accessibilityLabel}下限 ${formatValue(lower)}`}
          accessibilityRole="adjustable"
          accessibilityValue={{ min: minimum, max: upper, now: lower, text: formatValue(lower) }}
          onAccessibilityAction={handleAccessibility('lower')}
          style={[styles.thumb, { backgroundColor: theme.surface, borderColor: theme.accent, left: `${lowerRatio * 100}%` }]}
          testID={testID ? `${testID}-lower-thumb` : undefined}
          {...lowerResponder.panHandlers}
        />
        <View
          accessible
          accessibilityActions={[{ name: 'decrement' }, { name: 'increment' }]}
          accessibilityLabel={`${accessibilityLabel}上限 ${formatValue(upper)}`}
          accessibilityRole="adjustable"
          accessibilityValue={{ min: lower, max: maximum, now: upper, text: formatValue(upper) }}
          onAccessibilityAction={handleAccessibility('upper')}
          style={[styles.thumb, { backgroundColor: theme.surface, borderColor: theme.accent, left: `${upperRatio * 100}%` }]}
          testID={testID ? `${testID}-upper-thumb` : undefined}
          {...upperResponder.panHandlers}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, minWidth: 0, gap: 6 },
  values: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  value: { minWidth: 52, fontSize: 12, lineHeight: 17, fontWeight: '800', fontVariant: ['tabular-nums'] },
  separator: { fontSize: 11 },
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
