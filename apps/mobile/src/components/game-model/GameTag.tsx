import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useCachedTabActive } from '@/components/CachedTabScreen';
import {
  findTagGroup,
  findTagItem,
  type GameManifestV1,
  type Paint,
  type SurfaceStyle,
  type TagRef,
  type TagValue,
} from '@/domain/game-model';
import { useAppTheme } from '@/theme/app-theme';

function valueText(value: TagValue | undefined): string {
  if (!value) return '';
  if (value.kind === 'tag-group') {
    return value.value.items
      .map((item) => `${item.itemId} ${valueText(item.value)}`.trim())
      .join(' · ');
  }
  if (value.kind === 'int') return value.value.toLocaleString('en-US');
  return String(value.value);
}

export function formatGameTag(
  manifest: GameManifestV1,
  ref: TagRef,
  simplified = false,
): string {
  const group = findTagGroup(manifest, ref.groupId);
  const item = findTagItem(manifest, ref);
  const label = item?.label ?? ref.itemId;
  const value = valueText(ref.value ?? item?.defaultValue);
  if (!value) return label;
  if (label === value) return label;
  if (simplified && group?.role === 'difficulty-axis') return value;
  if (group?.role === 'difficulty-axis') {
    return group.valueSeparator === 'parentheses'
      ? `${label}(${value})`
      : `${label} ${value}`;
  }
  return `${label} ${value}`;
}

function gradientProps(paint: Extract<Paint, { kind: 'gradient' }>) {
  const points = paint.direction === 'vertical'
    ? { start: { x: 0.5, y: 0 }, end: { x: 0.5, y: 1 } }
    : paint.direction === 'diagonal-down'
      ? { start: { x: 0, y: 0 }, end: { x: 1, y: 1 } }
      : paint.direction === 'diagonal-up'
        ? { start: { x: 0, y: 1 }, end: { x: 1, y: 0 } }
        : { start: { x: 0, y: 0.5 }, end: { x: 1, y: 0.5 } };
  return {
    colors: paint.colors,
    ...(paint.locations ? {
      locations: paint.locations as unknown as readonly [number, number, ...number[]],
    } : {}),
    ...points,
  };
}

function useFlowingPaint(paint: Paint | undefined, width: number) {
  const progress = useRef(new Animated.Value(0)).current;
  const tabActive = useCachedTabActive();
  const enabled = paint?.kind === 'gradient' && paint.animated && tabActive;
  useEffect(() => {
    progress.setValue(0);
    if (!enabled) return;
    const animation = Animated.loop(Animated.timing(progress, {
      toValue: 1,
      duration: paint.durationMs ?? 1_800,
      easing: Easing.linear,
      useNativeDriver: true,
    }));
    animation.start();
    return () => animation.stop();
  }, [enabled, paint, progress]);
  return progress.interpolate({ inputRange: [0, 1], outputRange: [-width, 0] });
}

function PaintedText({
  paint,
  children,
  style,
}: {
  paint: Paint | undefined;
  children: ReactNode;
  style?: StyleProp<TextStyle>;
}) {
  const theme = useAppTheme();
  const [width, setWidth] = useState(80);
  const translateX = useFlowingPaint(paint, width);
  if (!paint || paint.kind === 'solid') {
    return <Text style={[style, { color: paint?.color ?? theme.text }]}>{children}</Text>;
  }
  return (
    <MaskedView
      onLayout={(event) => setWidth(Math.max(1, event.nativeEvent.layout.width))}
      style={styles.textMask}
      maskElement={<Text style={[style, styles.maskText]}>{children}</Text>}
    >
      {paint.animated ? (
        <Animated.View style={{ width: width * 2, flex: 1, transform: [{ translateX }] }}>
          <LinearGradient {...gradientProps(paint)} style={StyleSheet.absoluteFill} />
        </Animated.View>
      ) : (
        <LinearGradient {...gradientProps(paint)} style={StyleSheet.absoluteFill} />
      )}
    </MaskedView>
  );
}

type Overlay = NonNullable<SurfaceStyle['overlay']>;

function PaintLayer({
  paint,
  width,
  opacity = 1,
}: {
  paint: Paint | undefined;
  width: number;
  opacity?: number;
}) {
  const translateX = useFlowingPaint(paint, width);
  if (!paint) return null;
  if (paint.kind === 'solid') {
    return (
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: paint.color, opacity }]}
      />
    );
  }
  if (paint.animated) {
    return (
      <Animated.View
        pointerEvents="none"
        style={[
          styles.flowingSurface,
          { width: width * 2, opacity, transform: [{ translateX }] },
        ]}
      >
        <LinearGradient {...gradientProps(paint)} style={StyleSheet.absoluteFill} />
      </Animated.View>
    );
  }
  return (
    <LinearGradient
      pointerEvents="none"
      {...gradientProps(paint)}
      style={[StyleSheet.absoluteFill, { opacity }]}
    />
  );
}

function PaintedSurface({
  paint,
  overlay,
  style,
  children,
}: {
  paint: Paint | undefined;
  overlay?: Overlay;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const [width, setWidth] = useState(80);
  return (
    <View
      style={style}
      onLayout={(event) => setWidth(Math.max(1, event.nativeEvent.layout.width))}
    >
      <PaintLayer paint={paint} width={width} />
      <PaintLayer paint={overlay?.paint} width={width} opacity={overlay?.opacity} />
      {children}
    </View>
  );
}

export function GameTag({
  manifest,
  tag,
  simplified = false,
  small = false,
}: {
  manifest: GameManifestV1;
  tag: TagRef;
  simplified?: boolean;
  small?: boolean;
}) {
  const group = findTagGroup(manifest, tag.groupId);
  const item = findTagItem(manifest, tag);
  const style = item?.style;
  const label = useMemo(
    () => formatGameTag(manifest, tag, simplified),
    [manifest, simplified, tag],
  );
  const shapeStyle = group?.shape === 'pill'
    ? styles.pill
    : group?.shape === 'rounded-rect'
      ? styles.roundedRect
      : styles.shapeNone;
  const background = group?.shape === 'none' ? undefined : style?.surface?.background;
  const border = group?.shape === 'none' ? undefined : style?.surface?.border;
  const borderColor = border?.kind === 'solid' ? border.color : undefined;
  return (
    <PaintedSurface
      paint={background}
      overlay={style?.surface?.overlay}
      style={[
        styles.tag,
        shapeStyle,
        borderColor ? { borderColor, borderWidth: 1 } : null,
      ]}
    >
      <PaintedText
        paint={style?.text.fill}
        style={[
          styles.tagText,
          small && styles.smallText,
          style?.text.offset ? {
            transform: [
              { translateX: style.text.offset.x },
              { translateY: style.text.offset.y },
            ],
          } : null,
        ]}
      >
        {label}
      </PaintedText>
      {tag.auxiliaryValue !== undefined ? (
        <Text style={[styles.auxiliaryText, small && styles.smallAuxiliaryText]}>
          {tag.auxiliaryValue.toFixed(1)}
        </Text>
      ) : null}
    </PaintedSurface>
  );
}

const styles = StyleSheet.create({
  tag: {
    minHeight: 22,
    minWidth: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  pill: { borderRadius: 999, paddingHorizontal: 8 },
  roundedRect: { borderRadius: 6, paddingHorizontal: 8 },
  shapeNone: { minHeight: 0, paddingHorizontal: 0 },
  tagText: { fontSize: 10, lineHeight: 14, fontWeight: '800', includeFontPadding: false },
  smallText: { fontSize: 9, lineHeight: 12 },
  auxiliaryText: { marginLeft: 4, color: '#FFFFFFCC', fontSize: 9, fontWeight: '800' },
  smallAuxiliaryText: { fontSize: 8 },
  textMask: { minHeight: 16, alignSelf: 'stretch' },
  maskText: { color: '#000000' },
  flowingSurface: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
  },
});
