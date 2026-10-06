import { Fragment } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Line, Polygon, Text as SvgText } from 'react-native-svg';
import { MAIMAI_DXTAG_AXES, type MaimaiDxTagScores } from '@/providers/maimai-dxtag';
import { useAppTheme } from '@/theme/app-theme';

const SIZE = 320;
const CENTER = SIZE / 2;
const CHART_RADIUS = 86;
const LABEL_RADIUS = 118;
const VALUE_OFFSET = 18;
const LABEL_GAP = 14;
const RING_RATIOS = [0.5, 1] as const;
const FILL_OPACITY = 0.35;
/** 自上顺时针：技巧、体力、星星、键盘、爆发。 */
const SLOT_SCORE = [2, 3, 1, 0, 4] as const;

function slotAngle(slot: number) {
  return -Math.PI / 2 + (slot * Math.PI * 2) / SLOT_SCORE.length;
}

function pointAt(slot: number, radius: number) {
  const angle = slotAngle(slot);
  return {
    x: CENTER + Math.cos(angle) * radius,
    y: CENTER + Math.sin(angle) * radius,
  };
}

function outerXAt(y: number, side: -1 | 1): number {
  let bound = side > 0 ? -Infinity : Infinity;
  for (let slot = 0; slot < SLOT_SCORE.length; slot += 1) {
    const start = pointAt(slot, CHART_RADIUS);
    const end = pointAt((slot + 1) % SLOT_SCORE.length, CHART_RADIUS);
    const minY = Math.min(start.y, end.y);
    const maxY = Math.max(start.y, end.y);
    if (y < minY || y > maxY || start.y === end.y) continue;
    const t = (y - start.y) / (end.y - start.y);
    const x = start.x + t * (end.x - start.x);
    bound = side > 0 ? Math.max(bound, x) : Math.min(bound, x);
  }
  return bound;
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
  const axes = SLOT_SCORE.map((_, slot) => pointAt(slot, CHART_RADIUS));
  const dataPoints = SLOT_SCORE.map((scoreIndex, slot) => pointAt(slot, CHART_RADIUS * (scores[scoreIndex] / 10)));
  return <View style={styles.wrap} testID={`maimai-difficulty-radar-${difficulty}`}>
    <Svg width="100%" height="100%" viewBox={`0 0 ${SIZE} ${SIZE}`}>
      {RING_RATIOS.map((ratio) => <Polygon
        key={ratio}
        points={pointsString(SLOT_SCORE.map((_, slot) => pointAt(slot, CHART_RADIUS * ratio)))}
        fill="none"
        stroke={theme.border}
        strokeWidth={ratio === 1 ? 1.4 : 1}
      />)}
      {axes.map((point, slot) => <Line
        key={MAIMAI_DXTAG_AXES[SLOT_SCORE[slot]]}
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
      {SLOT_SCORE.map((scoreIndex, slot) => {
        const axis = MAIMAI_DXTAG_AXES[scoreIndex];
        const placed = pointAt(slot, LABEL_RADIUS);
        const valueY = placed.y + VALUE_OFFSET;
        const anchor = Math.abs(placed.x - CENTER) < 8 ? 'middle' : placed.x < CENTER ? 'end' : 'start';
        const x = anchor === 'middle'
          ? CENTER
          : anchor === 'start'
            ? Math.max(placed.x, outerXAt(valueY, 1) + LABEL_GAP)
            : Math.min(placed.x, outerXAt(valueY, -1) - LABEL_GAP);
        const nameY = anchor === 'middle' ? pointAt(0, CHART_RADIUS).y - LABEL_GAP - VALUE_OFFSET : placed.y;
        return <Fragment key={axis}>
          <SvgText
            x={x}
            y={nameY}
            fill={theme.text}
            fontSize={15}
            fontWeight="700"
            textAnchor={anchor}
          >{axis}</SvgText>
          <SvgText
            x={x}
            y={nameY + VALUE_OFFSET}
            fill={color}
            fontSize={14}
            fontWeight="700"
            textAnchor={anchor}
          >{scores[scoreIndex].toFixed(1)}</SvgText>
        </Fragment>;
      })}
    </Svg>
  </View>;
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    aspectRatio: 1,
    alignSelf: 'center',
    marginTop: 10,
  },
});
