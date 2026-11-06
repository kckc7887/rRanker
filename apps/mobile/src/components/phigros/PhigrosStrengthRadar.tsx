import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { RadarPlot, radarPoint } from '../game-content/RadarPlot';
import Svg from 'react-native-svg';
import type { PhigrosTagRksStat } from '@/domain/phigros-strength-analysis';
import { useAppTheme } from '@/theme/app-theme';

const LABEL_RESERVE = 72;
const TOP_PAD = 44;
const BOTTOM_PAD = 36;
const RING_RATIOS = [0.25, 0.5, 0.75, 1] as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatAxisScore(averageRks: number | null, min: number, max: number): string {
  if (averageRks == null) return '—';
  const span = Math.max(max - min, 0.1);
  return (clamp((averageRks - min) / span, 0, 1) * 10).toFixed(1);
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
  const ratios = tags.map(tag => tag.averageRks == null ? null : clamp((tag.averageRks - min) / span, 0, 1));

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
          <RadarPlot cx={cx} cy={cy} radius={chartRadius} values={ratios}
            rings={RING_RATIOS} color={theme.accent} markers />
        </Svg>
      {tags.map((tag, index) => {
        const vertex = radarPoint(index, tags.length, chartRadius, cx, cy);
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
            <Text style={[styles.labelValue, { color: theme.accent }]}>{formatAxisScore(tag.averageRks, min, max)}</Text>
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
