/** DXTag cbea1ff20d69c3eaa163c7d967b708bd076e5d96 (MIT), Copyright (c) 2026 尘言.
 * https://github.com/kckc7887/DXTag — see THIRD_PARTY_NOTICES.md.
 */
import type {Point2D} from '../../types';

export const TAU = 2 * Math.PI;
export const RADIUS = 4.8;
export const STEP = RADIUS * Math.PI / 32;
export const wrap = (x: number, period = TAU): number => ((x % period) + period) % period;
export const polar = (r: number, angle: number, center: Point2D = {x:0,y:0}): Point2D =>
  ({x:center.x + r * Math.cos(angle), y:center.y + r * Math.sin(angle)});
export const distance = (a: Point2D, b: Point2D): number => Math.hypot(a.x-b.x,a.y-b.y);
export const bearing = (a: Point2D, b: Point2D): number => Math.atan2(b.y-a.y,b.x-a.x);
export interface Curve {
  length: number;
  point: (distance: number) => Point2D;
  tangent: (distance: number) => number;
  circular: boolean;
}
export function line(a: Point2D, b: Point2D): Curve {
  const length = distance(a,b), direction = bearing(a,b);
  return {length, circular:false, tangent:() => direction,
    point:d => length ? {x:a.x+(b.x-a.x)*d/length,y:a.y+(b.y-a.y)*d/length} : a};
}
export function arc(center: Point2D, radius: number, angle: number, sweep: number): Curve {
  return {length: Math.abs(sweep) * radius, circular:true,
    point:d => polar(radius,angle + Math.sign(sweep)*d/radius,center),
    tangent:d => angle + Math.sign(sweep)*(d/radius + Math.PI/2)};
}

/** Tangent–circle–tangent path, parametrised by travelled distance. */
export function orbit(a: Point2D, b: Point2D, center: Point2D, radius: number, direction: 1 | -1, minimumSweep = 0): Curve[] {
  const entryAngle = bearing(center,a) + direction * Math.acos(Math.min(1,radius/distance(center,a)));
  const exitAngle = bearing(center,b) - direction * Math.acos(Math.min(1,radius/distance(center,b)));
  let sweep = wrap(direction * (exitAngle-entryAngle));
  if (sweep < Math.max(1e-8,minimumSweep)) sweep += TAU;
  const entry = polar(radius,entryAngle,center), exit = polar(radius,exitAngle,center);
  return [line(a,entry),arc(center,radius,entryAngle,direction*sweep),line(exit,b)];
}

export function curveAt(curves: readonly Curve[], travel: number): {curve: Curve; local: number} {
  for (const curve of curves) {
    if (travel <= curve.length) return {curve,local:Math.max(0,travel)};
    travel -= curve.length;
  }
  const curve = curves.at(-1)!;
  return {curve,local:curve.length};
}
