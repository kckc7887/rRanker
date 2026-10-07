/** DXTag cbea1ff20d69c3eaa163c7d967b708bd076e5d96 (MIT), Copyright (c) 2026 尘言.
 * https://github.com/kckc7887/DXTag — see THIRD_PARTY_NOTICES.md.
 */
import type {Point2D} from '../../types';
import {distance, polar} from './curves';

export function buttonPoint(position: number): Point2D {
  return polar(4.8,Math.PI*(5/8-position/4));
}
export function touchPoint(position: string): Point2D {
  if (position.startsWith('C')) return {x:0,y:0};
  const group = position[0]!, index = Number(position.slice(1));
  const radius = group === 'B' ? 2.2 : group === 'E' ? 3.1 : 4.1;
  return polar(radius,Math.PI*((group === 'D' || group === 'E' ? 6 : 5)-2*index)/8);
}

/** Sensor contacts are spatial intervals along the polyline, in sample coordinates. */
export function sensorIntervals(samples: readonly Point2D[], end: number): number[][] {
  const sensors = [
    ...Array.from({length:8},(_,i) => ({id:i,point:polar(4.4,Math.PI*(5/8-(i+1)/4)),radius:1.15})),
    ...Array.from({length:8},(_,i) => ({id:i+8,point:polar(2.1,Math.PI*(5/8-(i+1)/4)),radius:.85})),
    {id:16,point:{x:0,y:0},radius:.9},
  ];
  const intervals: number[][] = [];
  for (const sensor of sensors) {
    let start = -1;
    for (let i = 0; i <= samples.length; i++) {
      const inside = i < samples.length && distance(samples[i]!,sensor.point) <= sensor.radius;
      if (inside && start < 0) start = i;
      if (!inside && start >= 0) {
        if (i-start >= 2 || sensor.id === 16) intervals.push([Math.max(2,start),i-1,sensor.id,-1]);
        start = -1;
      }
    }
  }
  // The end gate represents arrival; preparatory contacts belong to preceding gates.
  const last = intervals.filter(g => g[2] === end-1).at(-1);
  if (last) {last[0]=samples.length; last[1]=samples.length;}
  else intervals.push([samples.length,samples.length,end-1,-1]);
  return intervals.filter(g => g[0]<=g[1]).sort((a,b)=>a[0]-b[0]||a[2]-b[2]);
}
