import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Polygon, Text as SvgText, TSpan } from 'react-native-svg';
import type { PhigrosTagRksStat } from '@/domain/phigros-strength-analysis';
import { useAppTheme } from '@/theme/app-theme';

const SIZE = 320;
const CENTER = SIZE / 2;
const CHART_RADIUS = 102;
const LABEL_RADIUS = 137;
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

function formatAxisValue(tag: PhigrosTagRksStat): string {
  if (tag.averageRks == null) return '—';
  return `${tag.averageRks.toFixed(4)} · ${tag.sampleCount}谱面${tag.isSmallSample ? ' · 样本较少' : ''}`;
}

export function PhigrosStrengthRadar({
  tags,
  min,
  max,
}: {
  tags: readonly PhigrosTagRksStat[];
  min: number;
  max: number;
}) {
  const theme = useAppTheme();
  const span = Math.max(max - min, 0.1);
  const axes = tags.map((_, index) => polarPoint(index, tags.length, CHART_RADIUS));
  const dataPoints = tags.map((tag, index) => {
    const ratio = tag.averageRks == null ? 0 : clamp((tag.averageRks - min) / span, 0, 1);
    return polarPoint(index, tags.length, CHART_RADIUS * ratio);
  });
  const accessibilityLabel = `五维实力雷达，刻度 ${min.toFixed(1)} 到 ${max.toFixed(4)}。${tags
    .map((tag) => `${tag.name} ${tag.averageRks == null ? '无数据' : `${tag.averageRks.toFixed(4)}，${tag.sampleCount}张谱面`}`)
    .join('；')}`;

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      style={styles.wrap}
      testID="phigros-strength-radar"
    >
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
        {tags.map((tag, index) => {
          const point = polarPoint(index, tags.length, LABEL_RADIUS);
          const anchor = Math.abs(point.x - CENTER) < 8 ? 'middle' : point.x < CENTER ? 'start' : 'end';
          return (
            <SvgText
              key={tag.tagId}
              x={point.x}
              y={point.y - 7}
              fill={theme.text}
              fontSize={13}
              fontWeight="700"
              textAnchor={anchor}
            >
              {tag.name}
              <TSpan
                x={point.x}
                dy={17}
                fill={tag.averageRks == null ? theme.textMuted : theme.accent}
                fontSize={10}
                fontWeight="600"
              >
                {formatAxisValue(tag)}
              </TSpan>
            </SvgText>
          );
        })}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    maxWidth: SIZE,
    aspectRatio: 1,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
