import { StyleSheet, View } from 'react-native';
import Svg, { Line, Polygon, Text as SvgText } from 'react-native-svg';
import { MAIMAI_DXTAG_AXES, type MaimaiDxTagScores } from '@/providers/maimai-dxtag';
import { useAppTheme } from '@/theme/app-theme';

const SIZE = 220;
const CENTER = SIZE / 2;
const CHART_RADIUS = 68;
const LABEL_RADIUS = 96;
const RING_RATIOS = [0.5, 1] as const;
const FILL_OPACITY = 0.35;

function polarPoint(index: number, radius: number) {
  const angle = -Math.PI / 2 + (index * Math.PI * 2) / MAIMAI_DXTAG_AXES.length;
  return {
    x: CENTER + Math.cos(angle) * radius,
    y: CENTER + Math.sin(angle) * radius,
  };
}

function pointsString(points: readonly { x: number; y: number }[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(' ');
}

export function MaimaiDifficultyRadar({
  scores,
  color,
  difficulty,
}: {
  scores: MaimaiDxTagScores;
  color: string;
  difficulty: string;
}) {
  const theme = useAppTheme();
  const axes = MAIMAI_DXTAG_AXES.map((_, index) => polarPoint(index, CHART_RADIUS));
  const dataPoints = scores.map((score, index) => polarPoint(index, CHART_RADIUS * (score / 10)));
  return <View style={styles.wrap} testID={`maimai-difficulty-radar-${difficulty}`}>
    <Svg width="100%" height="100%" viewBox={`0 0 ${SIZE} ${SIZE}`}>
      {RING_RATIOS.map((ratio) => <Polygon
        key={ratio}
        points={pointsString(MAIMAI_DXTAG_AXES.map((_, index) => polarPoint(index, CHART_RADIUS * ratio)))}
        fill="none"
        stroke={theme.border}
        strokeWidth={ratio === 1 ? 1.4 : 1}
      />)}
      {axes.map((point, index) => <Line
        key={MAIMAI_DXTAG_AXES[index]}
        x1={CENTER}
        y1={CENTER}
        x2={point.x}
        y2={point.y}
        stroke={theme.border}
        strokeWidth={1}
      />)}
      <Polygon
        testID={`maimai-difficulty-radar-shape-${difficulty}`}
        points={pointsString(dataPoints)}
        fill={color}
        fillOpacity={FILL_OPACITY}
        stroke={color}
        strokeWidth={2.4}
        strokeLinejoin="round"
      />
      {MAIMAI_DXTAG_AXES.map((axis, index) => {
        const point = polarPoint(index, LABEL_RADIUS);
        const anchor = Math.abs(point.x - CENTER) < 8 ? 'middle' : point.x < CENTER ? 'start' : 'end';
        return <SvgText
          key={axis}
          x={point.x}
          y={point.y + 4}
          fill={theme.text}
          fontSize={12}
          fontWeight="700"
          textAnchor={anchor}
        >{axis}</SvgText>;
      })}
    </Svg>
  </View>;
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    maxWidth: SIZE,
    aspectRatio: 1,
    alignSelf: 'center',
    marginTop: 10,
  },
});
