import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';
import { formatStorageBytes } from '@/features/storage-management/fs-storage';
import type { StorageUsageSegment } from '@/features/storage-management/storage-usage';
import { useAppTheme } from '@/theme/app-theme';

type Props = {
  segments: readonly StorageUsageSegment[];
  totalBytes: number;
  size?: number;
};

function polarToCartesian(cx: number, cy: number, radius: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
}

function describeArc(
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  endAngle: number,
): string {
  const start = polarToCartesian(cx, cy, radius, endAngle);
  const end = polarToCartesian(cx, cy, radius, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? '0' : '1';
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 0 ${end.x} ${end.y}`;
}

export function StorageDonutChart({ segments, totalBytes, size = 200 }: Props) {
  const theme = useAppTheme();
  const strokeWidth = 28;
  const cx = size / 2;
  const cy = size / 2;
  const radius = (size - strokeWidth) / 2;
  const measurable = segments.filter((segment) => segment.bytes > 0);
  const sum = measurable.reduce((acc, segment) => acc + segment.bytes, 0);

  let cursor = 0;
  const arcs = sum <= 0
    ? []
    : measurable.map((segment) => {
      const sweep = (segment.bytes / sum) * 360;
      const start = cursor;
      const end = cursor + Math.max(sweep, 0.5);
      cursor += sweep;
      return { id: segment.id, color: segment.color, start, end: Math.min(end, 359.999) };
    });

  return (
    <View style={styles.wrap} accessibilityLabel={`存储占用合计 ${formatStorageBytes(totalBytes)}`}>
      <Svg width={size} height={size}>
        <Circle
          cx={cx}
          cy={cy}
          r={radius}
          stroke={theme.border}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <G>
          {arcs.map((arc) => (
            <Path
              key={arc.id}
              d={describeArc(cx, cy, radius, arc.start, arc.end)}
              stroke={arc.color}
              strokeWidth={strokeWidth}
              fill="none"
              strokeLinecap="butt"
            />
          ))}
        </G>
      </Svg>
      <View style={styles.center} pointerEvents="none">
        <Text style={[styles.totalLabel, { color: theme.textMuted }]}>已用空间</Text>
        <Text style={[styles.totalValue, { color: theme.text }]}>{formatStorageBytes(totalBytes)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  totalLabel: { fontSize: 13, fontWeight: '600' },
  totalValue: { fontSize: 22, fontWeight: '800', marginTop: 4 },
});
