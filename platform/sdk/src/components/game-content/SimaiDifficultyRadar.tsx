import { radarPoint, RadarPlot } from '@rranker/sdk/components/game-content/RadarPlot';
import { Fragment } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Text as SvgText } from 'react-native-svg';
import { useAppTheme } from '@rranker/sdk/theme/app-theme';

const SIMAI_DIFFICULTY_AXES = ['键盘', '星星', '技巧', '体力', '爆发'] as const;
const SIZE = 320;
const CENTER = SIZE / 2;
const CHART_RADIUS = 86;
const LABEL_RADIUS = 118;
const VALUE_OFFSET = 18;
const LABEL_GAP = 14;
const RING_RATIOS = [0.5, 1] as const;
/** 自上顺时针：技巧、体力、星星、键盘、爆发。 */
const SLOT_SCORE = [2, 3, 1, 0, 4] as const;

function pointAt(slot: number, radius: number) {
  return radarPoint(slot, SLOT_SCORE.length, radius, CENTER, CENTER);
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

export function SimaiDifficultyRadar({
  scores,
  color,
  difficulty,
  onAxisPress,
  axisNames = SIMAI_DIFFICULTY_AXES,
}: {
  scores: readonly (number | null)[];
  color: string;
  difficulty: string;
  onAxisPress?: (index: number) => void;
  axisNames?: readonly string[];
}) {
  const theme = useAppTheme();
  return <View style={styles.wrap} testID={`simai-difficulty-radar-${difficulty}`}>
    <Svg width="100%" height="100%" viewBox={`0 0 ${SIZE} ${SIZE}`}>
      <RadarPlot cx={CENTER} cy={CENTER} radius={CHART_RADIUS} rings={RING_RATIOS} color={color}
        values={SLOT_SCORE.map(index => scores[index] == null ? null : scores[index] / 10)}
        drawShape={scores.every(score => score !== null)} shapeTestID={`simai-difficulty-radar-shape-${difficulty}`} />
      {SLOT_SCORE.map((scoreIndex, slot) => {
        const axis = axisNames[scoreIndex];
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
            testID={`simai-difficulty-radar-axis-${difficulty}-${scoreIndex}`}
            onPress={onAxisPress ? () => onAxisPress(scoreIndex) : undefined}
            x={x}
            y={nameY}
            fill={theme.text}
            fontSize={15}
            fontWeight="700"
            textAnchor={anchor}
          >{axis}</SvgText>
          <SvgText
            onPress={onAxisPress ? () => onAxisPress(scoreIndex) : undefined}
            x={x}
            y={nameY + VALUE_OFFSET}
            fill={color}
            fontSize={14}
            fontWeight="700"
            textAnchor={anchor}
          >{scores[scoreIndex]?.toFixed(1) ?? '暂无数据'}</SvgText>
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
