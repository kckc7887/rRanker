import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Polygon } from 'react-native-svg';
import type { PhigrosTagRksStat } from '@/domain/phigros-strength-analysis';
import { useAppTheme } from '@/theme/app-theme';

const LABEL_RESERVE = 72;
const TOP_PAD = 44;
const BOTTOM_PAD = 36;
const RING_RATIOS = [0.25, 0.5, 0.75, 1] as const;

function axisPoint(index: number, count: number, radius: number, cx: number, cy: number) {
  const angle = -Math.PI / 2 + (index * Math.PI * 2) / count;
  return {
    x: cx + Math.cos(angle) * radius,
    y: cy + Math.sin(angle) * radius,
    cos: Math.cos(angle),
    sin: Math.sin(angle),
  };
}

function pointsString(points: readonly { x: number; y: number }[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(' ');
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatAxisRks(tag: PhigrosTagRksStat): string {
  return tag.averageRks == null ? '—' : tag.averageRks.toFixed(4);
}

export function PhigrosStrengthRadar({
  tags,
  min,
  max,
  onTagPress,
}: {
  tags: readonly PhigrosTagRksStat[];
  min: number;
  max: number;
  onTagPress?: (tag: PhigrosTagRksStat) => void;
}) {
  const theme = useAppTheme();
  const [width, setWidth] = useState(320);
  const chartRadius = Math.max(88, width / 2 - LABEL_RESERVE);
  const cx = width / 2;
  const cy = TOP_PAD + chartRadius;
  const height = cy + chartRadius + BOTTOM_PAD;
  const span = Math.max(max - min, 0.1);
  const ringPoints = (ratio: number) => tags.map((_, index) => axisPoint(index, tags.length, chartRadius * ratio, cx, cy));
  const dataPoints = tags.map((tag, index) => {
    const ratio = tag.averageRks == null ? 0 : clamp((tag.averageRks - min) / span, 0, 1);
    return axisPoint(index, tags.length, chartRadius * ratio, cx, cy);
  });

  return (
    <View
      onLayout={(event) => {
        const next = Math.round(event.nativeEvent.layout.width);
        setWidth((current) => (current === next ? current : next));
      }}
      style={[styles.wrap, { height }]}
      testID="phigros-strength-radar"
    >
        <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
          {RING_RATIOS.map((ratio) => (
            <Polygon
              key={ratio}
              points={pointsString(ringPoints(ratio))}
              fill="none"
              stroke={theme.border}
              strokeWidth={ratio === 1 ? 1.6 : 1}
              strokeOpacity={ratio === 1 ? 0.9 : 0.45}
            />
          ))}
          {ringPoints(1).map((point, index) => (
            <Line
              key={tags[index]!.tagId}
              x1={cx}
              y1={cy}
              x2={point.x}
              y2={point.y}
              stroke={theme.border}
              strokeWidth={1}
              strokeOpacity={0.55}
            />
          ))}
          <Polygon
            points={pointsString(dataPoints)}
            fill={theme.accent}
            fillOpacity={0.22}
            stroke={theme.accent}
            strokeWidth={2.5}
            strokeLinejoin="round"
          />
          {dataPoints.map((point, index) => tags[index]!.averageRks == null ? null : (
            <Circle
              key={tags[index]!.tagId}
              cx={point.x}
              cy={point.y}
              r={4}
              fill={theme.background}
              stroke={theme.accent}
              strokeWidth={2}
            />
          ))}
        </Svg>
      {tags.map((tag, index) => {
        const vertex = axisPoint(index, tags.length, chartRadius, cx, cy);
        const anchor = Math.abs(vertex.cos) < 0.35 ? 'middle' : vertex.cos < 0 ? 'end' : 'start';
        const y = anchor === 'middle' ? vertex.y - 42 : vertex.y - 18;
        return (
          <Pressable
            key={tag.tagId}
            accessibilityRole="button"
            accessibilityLabel={`查看${tag.name}标签歌曲列表`}
            disabled={!onTagPress}
            onPress={() => onTagPress?.(tag)}
            style={[
              styles.label,
              { top: y },
              anchor === 'middle' ? { left: vertex.x - 40, width: 80, alignItems: 'center' }
                : anchor === 'end' ? { right: width - vertex.x + 8, alignItems: 'flex-end' }
                  : { left: vertex.x + 8, alignItems: 'flex-start' },
            ]}
          >
            <Text style={[styles.labelName, { color: theme.text }]}>{tag.name}</Text>
            <Text style={[styles.labelValue, { color: theme.accent }]}>{formatAxisRks(tag)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', marginHorizontal: -8 },
  label: { position: 'absolute' },
  labelName: { fontSize: 15, lineHeight: 18, fontWeight: '800' },
  labelValue: { fontSize: 13, lineHeight: 16, fontWeight: '800', fontVariant: ['tabular-nums'] },
});
