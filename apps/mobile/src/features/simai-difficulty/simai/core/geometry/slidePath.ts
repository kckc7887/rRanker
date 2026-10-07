/** DXTag cbea1ff20d69c3eaa163c7d967b708bd076e5d96 (MIT), Copyright (c) 2026 尘言.
 * https://github.com/kckc7887/DXTag — see THIRD_PARTY_NOTICES.md.
 */
import type {SlideBranch, SlideSegment} from '../../types';
import {arc, bearing, curveAt, line, orbit, polar, RADIUS, STEP, wrap, type Curve} from './curves';
import {buttonPoint, sensorIntervals, touchPoint} from './sensors';
import {customCurves} from './custom';
export {buttonPoint, touchPoint};
export type Pose = {x: number; y: number; angle: number; length: number};
export type Geometry = {length: number; arrows: Pose[]; areas: number[][]; wifi: boolean};

const origin = {x:0,y:0};
const cache = new Map<string,Geometry>();
function curvesFor(s: SlideSegment): Curve[] {
  const a = buttonPoint(s.startPos), b = buttonPoint(s.endPos), diff = wrap(s.endPos-s.startPos,8);
  const angle = bearing(origin,a), fail = (): never => {throw new Error(`Unsupported Slide path: ${s.code}`);};
  switch (s.type) {
    case '-':
      if (diff < 2 || diff > 6) return fail();
      return [line(a,b)];
    case 'w':
      if (diff !== 4) return fail();
      return [line(a,b)];
    case '^':
    case '<':
    case '>': {
      if (s.type === '^' && (diff === 0 || diff === 4)) return fail();
      const clockwise = s.type === '^' ? diff < 4 : (s.type === '>') !== (s.startPos >= 3 && s.startPos <= 6);
      const units = clockwise ? diff : wrap(-diff,8);
      return [arc(origin,RADIUS,angle,(clockwise ? -1:1)*((units || 8)*Math.PI/4 + .001))];
    }
    case 'v':
      return [line(a,origin),line(origin,b)];
    case 'V': {
      if (s.midPos === undefined) return fail();
      const first = wrap(s.midPos-s.startPos,8), last = wrap(s.endPos-s.midPos,8);
      if (!(first === 2 && last >= 2 && last <= 5 || first === 6 && last >= 3 && last <= 6)) return fail();
      const via = buttonPoint(s.midPos);
      return [line(a,via),line(via,b)];
    }
    case 's':
    case 'z': {
      if (diff !== 4) return fail();
      const corner = polar(RADIUS*Math.tan(Math.PI/8),angle+(s.type==='s'?1:-1)*Math.PI/2);
      const opposite = {x:-corner.x,y:-corner.y};
      return [line(a,corner),line(corner,opposite),line(opposite,b)];
    }
    case 'p': case 'q':
      return orbit(a,b,origin,RADIUS*Math.cos(3*Math.PI/8),s.type==='p'?1:-1);
    case 'pp': case 'qq': {
      const direction = s.type==='pp'?1:-1;
      const radius = RADIUS*Math.cos(Math.PI/8)/2;
      const center = polar(radius,angle-direction*3*Math.PI/8);
      return orbit(a,b,center,radius,direction,Math.PI/2);
    }
    case 'custom': return customCurves(s.code);
  }
}

/** Build from line/circle equations; the cache contains only locally computed geometry. */
export function geometryFor(segment: SlideSegment): Geometry {
  const key=[segment.type,segment.startPos,segment.midPos??'',segment.endPos,segment.code].join(':');
  const found=cache.get(key);if(found)return found;
  const curves=curvesFor(segment).filter(c=>c.length>1e-12),length=curves.reduce((sum,c)=>sum+c.length,0);
  if(!curves.length||!Number.isFinite(length)||length<=0)throw new Error(`Invalid Slide path: ${segment.code}`);
  const arrows:Pose[]=[];
  for(let i=0;i<=Math.ceil(length/STEP);i++){
    const travel=Math.min(length,i*STEP),{curve,local}=curveAt(curves,travel),point=curve.point(local);
    let angle=curve.tangent(local)+Math.PI;
    if(curve.circular&&arrows.length&&travel<length)angle=bearing(point,arrows.at(-1)!);
    arrows.push({...point,angle:wrap(angle),length:travel});
  }
  const geometry:Geometry={length,arrows,areas:sensorIntervals(arrows,segment.endPos),wifi:segment.type==='w'};
  cache.set(key,geometry);return geometry;
}

export function prepareBranch(branch: SlideBranch): {geometry:Geometry; startMs:number; durationMs:number}[] {
  const geometries=branch.segments.map(geometryFor),length=geometries.reduce((sum,g)=>sum+g.length,0);
  const perSegment=branch.segments.every(s=>s.durationMs!==null);
  let cursor=branch.delayMs;
  return geometries.map((geometry,i)=>{
    const durationMs=perSegment?branch.segments[i]!.durationMs!:branch.durationMs*geometry.length/length;
    const piece={geometry,startMs:cursor,durationMs};cursor+=durationMs;return piece;
  });
}
export function pathPose(geometry: Geometry, progress: number): Pose {
  const travel=Math.max(0,Math.min(1,progress))*geometry.length,samples=geometry.arrows;
  let lo=0,hi=samples.length-1;
  while(lo+1<hi){const mid=Math.floor((lo+hi)/2);if(samples[mid]!.length<travel)lo=mid;else hi=mid;}
  const a=samples[lo]!,b=samples[hi]!,fraction=(travel-a.length)/Math.max(1e-12,b.length-a.length);
  const turn=wrap(b.angle-a.angle+Math.PI)-Math.PI;
  return {x:a.x+(b.x-a.x)*fraction,y:a.y+(b.y-a.y)*fraction,angle:a.angle+turn*fraction,length:travel};
}
