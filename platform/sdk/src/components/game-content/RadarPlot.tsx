import { Circle, Line, Polygon } from 'react-native-svg';
import { useAppTheme } from '@rranker/sdk/theme/app-theme';

export function radarPoint(index: number, count: number, radius: number, cx: number, cy: number) {
  const angle = -Math.PI / 2 + (index * Math.PI * 2) / count;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: cx + cos * radius, y: cy + sin * radius, cos, sin };
}

export function RadarPlot({ cx, cy, radius, values, rings, color, markers = false, drawShape = true, shapeTestID }: {
  cx: number;
  cy: number;
  radius: number;
  values: readonly (number | null)[];
  rings: readonly number[];
  color: string;
  markers?: boolean;
  drawShape?: boolean;
  shapeTestID?: string;
}) {
  const theme = useAppTheme();
  const point = (index: number, ratio: number) => radarPoint(index, values.length, radius * ratio, cx, cy);
  const vertices = values.map((_, index) => point(index, 1));
  const points = values.map((value, index) => point(index, value ?? 0));
  const coordinates = (items: typeof points) => items.map(({ x, y }) => `${x},${y}`).join(' ');
  return <>
    {rings.map(ratio => <Polygon key={ratio} points={coordinates(values.map((_, index) => point(index, ratio)))}
      fill="none" stroke={theme.border} strokeWidth={ratio === 1 ? (markers ? 1.6 : 1.4) : 1}
      strokeOpacity={markers ? (ratio === 1 ? 0.9 : 0.45) : 1} />)}
    {vertices.map((vertex, index) => <Line key={index} x1={cx} y1={cy} x2={vertex.x} y2={vertex.y}
      stroke={theme.border} strokeWidth={1} strokeOpacity={markers ? 0.55 : 1} />)}
    {drawShape && <Polygon testID={shapeTestID}
      points={coordinates(points)} fill={color} fillOpacity={markers ? 0.22 : 0.35}
      stroke={color} strokeWidth={markers ? 2.5 : 2.4} strokeLinejoin="round" />}
    {markers && points.map((vertex, index) => values[index] === null ? null : <Circle key={index}
      cx={vertex.x} cy={vertex.y} r={4} fill={theme.surface} stroke={color} strokeWidth={2} />)}
  </>;
}
