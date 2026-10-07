/** DXTag cbea1ff20d69c3eaa163c7d967b708bd076e5d96 (MIT), Copyright (c) 2026 尘言.
 * https://github.com/kckc7887/DXTag — see THIRD_PARTY_NOTICES.md.
 */
import type {Point2D} from '../../types';
import {arc, bearing, distance, line, polar, RADIUS, TAU, wrap, type Curve} from './curves';
import {buttonPoint} from './sensors';

type Waypoint = {center: Point2D; radius: number; direction: 1 | -1; revolutions?: number};
type Bridge = {from: Point2D; to: Point2D; fromAngle: number; toAngle: number};

/** Common tangents of signed circles; a point is a circle of radius zero. */
function bridge(a: Waypoint, b: Waypoint): Bridge {
  const d = distance(a.center,b.center);
  if (a.radius === 0 && b.radius === 0)
    return {from:a.center,to:b.center,fromAngle:0,toAngle:0};
  if (a.radius && b.radius && a.direction !== b.direction) throw new Error('Custom orbit direction mismatch');
  const direction = a.radius ? a.direction : b.direction;
  const relativeSign = a.radius && b.radius ? a.direction*b.direction : 1;
  const projection = a.radius-relativeSign*b.radius;
  if (d < Math.abs(projection)-1e-10 || d < 1e-10) throw new Error('Custom orbit has no forward tangent');
  const theta = bearing(a.center,b.center)-direction*Math.acos(Math.max(-1,Math.min(1,projection/d)));
  const toAngle = theta + (relativeSign < 0 ? Math.PI : 0);
  return {from:polar(a.radius,theta,a.center),to:polar(b.radius,toAngle,b.center),fromAngle:theta,toAngle};
}

export function customCurves(code: string): Curve[] {
  const start = Number(code[0]), tokens = [...code.slice(1).matchAll(/([ABCPQK])([0-8]?)/g)];
  if (!(start>=1&&start<=8) || tokens.map(t=>t[0]).join('')!==code.slice(1) || tokens.at(-1)?.[1]!=='K')
    throw new Error(`Invalid custom path: ${code}`);
  const point = (center: Point2D): Waypoint => ({center,radius:0,direction:1});
  const nodes = [point(buttonPoint(start))];
  for (const token of tokens) {
    const op = token[1]!, index = Number(token[2]);
    if (op === 'C') {
      if (token[2]) throw new Error(`Invalid center waypoint: ${code}`);
      nodes.push(point({x:0,y:0}));
    } else if (op === 'P' || op === 'Q') {
      if (!token[2]) throw new Error(`Missing orbit index: ${code}`);
      const radius = index ? RADIUS*Math.cos(Math.PI/8)/2 : RADIUS*Math.cos(3*Math.PI/8);
      nodes.push({center:index?polar(radius,Math.PI/2-(index-1)*Math.PI/4):{x:0,y:0},radius,direction:op==='P'?1:-1});
    } else {
      if (index < 1 || index > 8) throw new Error(`Invalid waypoint: ${code}`);
      nodes.push(point(op==='B'?polar(RADIUS*Math.tan(Math.PI/8),Math.PI*(5/8-index/4)):buttonPoint(index)));
    }
  }
  for(let i=1;i<nodes.length;i++){
    const previous=nodes[i-1]!,current=nodes[i]!;
    if(previous.radius && current.radius===previous.radius && distance(previous.center,current.center)<1e-10){
      if(previous.direction!==current.direction)throw new Error('Custom orbit direction mismatch');
      previous.revolutions=(previous.revolutions??0)+1;
      nodes.splice(i--,1);
    }
  }
  const bridges = nodes.slice(1).map((node,i)=>bridge(nodes[i]!,node)), curves: Curve[] = [];
  for (let i=0;i<bridges.length;i++) {
    const node=nodes[i]!, join=bridges[i]!;
    if (node.radius) {
      const entry=bridges[i-1]!.toAngle;
      const sweep=wrap(node.direction*(join.fromAngle-entry))+(node.revolutions??0)*TAU;
      curves.push(arc(node.center,node.radius,entry,node.direction*sweep));
    }
    curves.push(line(join.from,join.to));
  }
  return curves;
}
