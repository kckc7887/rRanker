import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Polygon } from 'react-native-svg';
import type { PhigrosTagRksStat } from '@/domain/phigros-strength-analysis';
import { useAppTheme } from '@/theme/app-theme';

const SIZE = 320;
const CENTER = SIZE / 2;
const CHART_RADIUS = 64;
const LABEL_RADIUS = 104;
const LABEL_WIDTH = 84;
const RING_RATIOS = [0.25, 0.5, 0.75, 1] as const;

function polarPoint(index: number, count: number, radius: number) {
  const angle = -Math.PI / 2 + (index * Math.PI * 2) / count;
  return {
    x: CENTER + Math.cos(angle) * radius,
    y: CENTER + Math.sin(angle) * radius,
  };
}

function pointsString(points: readonly { x: number; y: number }[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(' ');
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function labelAnchor(x: number): 'middle' | 'start' | 'end' {
  if (Math.abs(x - CENTER) < 12) return 'middle';
  return x < CENTER ? 'end' : 'start';
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
  const span = Math.max(max - min, 0.1);
  const axes = tags.map((_, index) => polarPoint(index, tags.length, CHART_RADIUS));
  const dataPoints = tags.map((tag, index) => {
    const ratio = tag.averageRks == null ? 0 : clamp((tag.averageRks - min) / span, 0, 1);
    return polarPoint(index, tags.length, CHART_RADIUS * ratio);
  });

  return (
    <View style={styles.wrap} testID="phigros-strength-radar">
      <Svg width="100%" height="100%" viewBox={`0 0 ${SIZE} ${SIZE}`}>
        {RING_RATIOS.map((ratio) => (
          <Polygon
            key={ratio}
            points={pointsString(tags.map((_, index) => polarPoint(
              index,
              tags.length,
              CHART_RADIUS * ratio,
            )))}
            fill="none"
            stroke={theme.border}
            strokeWidth={ratio === 1 ? 1.4 : 1}
            strokeOpacity={ratio === 1 ? 0.9 : 0.55}
          />
        ))}
        {axes.map((point, index) => (
          <Line
            key={tags[index]!.tagId}
            x1={CENTER}
            y1={CENTER}
            x2={point.x}
            y2={point.y}
            stroke={theme.border}
            strokeWidth={1}
            strokeOpacity={0.65}
          />
        ))}
        <Polygon
          points={pointsString(dataPoints)}
          fill={theme.accent}
          fillOpacity={0.2}
          stroke={theme.accent}
          strokeWidth={2.4}
          strokeLinejoin="round"
        />
        {dataPoints.map((point, index) => tags[index]!.averageRks == null ? null : (
          <Circle
            key={tags[index]!.tagId}
            cx={point.x}
            cy={point.y}
            r={3.5}
            fill={theme.surface}
            stroke={theme.accent}
            strokeWidth={2}
          />
        ))}
      </Svg>
      {tags.map((tag, index) => {
        const point = polarPoint(index, tags.length, LABEL_RADIUS);
        const anchor = labelAnchor(point.x);
        const align = anchor === 'middle' ? 'center' : anchor === 'end' ? 'right' : 'left';
        return (
          <Pressable
            key={tag.tagId}
            accessibilityRole="button"
            accessibilityLabel={`查看${tag.name}标签歌曲列表`}
            disabled={!onTagPress}
            onPress={() => onTagPress?.(tag)}
            style={[
              styles.label,
              anchor === 'middle' ? {
                left: `${(point.x / SIZE) * 100}%`,
                marginLeft: -LABEL_WIDTH / 2,
                alignItems: 'center',
              } : anchor === 'end' ? {
                right: `${((SIZE - point.x) / SIZE) * 100}%`,
                alignItems: 'flex-end',
              } : {
                left: `${(point.x / SIZE) * 100}%`,
                alignItems: 'flex-start',
              },
              { top: `${(point.y / SIZE) * 100}%` },
            ]}
          >
            <Text style={[styles.labelName, { color: theme.text, textAlign: align }]}>{tag.name}</Text>
            <Text style={[styles.labelValue, { color: theme.textSecondary, textAlign: align }]}>{formatAxisRks(tag)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    maxWidth: SIZE,
    aspectRatio: 1,
    alignSelf: 'center',
  },
  label: {
    position: 'absolute',
    width: LABEL_WIDTH,
  },
  labelName: { fontSize: 13, lineHeight: 16, fontWeight: '700' },
  labelValue: { fontSize: 11, lineHeight: 14, fontVariant: ['tabular-nums'] },
});
