/** DXTag cbea1ff20d69c3eaa163c7d967b708bd076e5d96 (MIT), Copyright (c) 2026 尘言.
 * https://github.com/kckc7887/DXTag — see THIRD_PARTY_NOTICES.md.
 */
/** 同时同速的完整短轨迹可与长轨迹前缀重合；逐折点比较，避免重复计算重合动作。 */
import type {Chart, SlideNote} from '../simai/types';
import {prepareBranch, pathPose, type Geometry} from '../simai/core/geometry/slidePath';
import {TimingTimeline} from '../simai/core/timing/TimingTimeline';
import type {SlideEvent} from './types';

export const SLIDE_ACTION_GROUPS_VERSION = 'research-slide-action-groups-v1';
export const SLIDE_ACTION_GROUPS_POLICY = Object.freeze({
  rendererDiameter: 9.6, positionToleranceFraction: .0025,
  maximumSpeedRatio: 1.01, launchToleranceOfShorterDuration: 1e-8,
  numericalRelativeTolerance: 1e-8, sourceScope: 'same-slide-id',
  grouping: 'longest-first-complete-link', fanPolicy: 'unresolved-singleton',
});
type Piece = {startMs:number; endMs:number; geometry:Geometry; speed:number};
type ActionBranchEvidence = {
  branchIndex:number; branchRef:string; code:string; startMs:number; endMs:number;
  geometryStatus:'supported'|'fan-unresolved'|'unsupported';
};
type SlideActionGroup = { slideId:number; effectiveActionCount:number; actions:{representative:string}[] };
type Prepared = {evidence:ActionBranchEvidence; pieces:Piece[]};
const numericEqual=(a:number,b:number)=>Math.abs(a-b)<=SLIDE_ACTION_GROUPS_POLICY.numericalRelativeTolerance*Math.max(1,Math.abs(a),Math.abs(b));

function prepare(note:SlideNote, branchIndex:number, event:SlideEvent|undefined, offset:number):Prepared {
  const branch=note.branches[branchIndex]!, pseudoEachOffsetMs=note.pseudoEachOffsetMs??0;
  const nominalHeadMs=note.timingMs-offset,headMs=nominalHeadMs-pseudoEachOffsetMs;
  const startMs=headMs+branch.delayMs,endMs=startMs+branch.durationMs;
  const evidence:ActionBranchEvidence={branchIndex,branchRef:`${note.id}:${branchIndex}`,
    code:branch.segments.map(s=>s.code).join('→'),startMs,endMs,geometryStatus:'supported'};
  let geometries:ReturnType<typeof prepareBranch>;
  try{geometries=prepareBranch(branch);}catch{
    evidence.geometryStatus='unsupported';
    return {evidence,pieces:[]};
  }
  if(!event)throw Error(`Supported source branch has no cached event: ${note.id}:${branchIndex}`);
  if(event.headPosition!==note.position||event.headless!==note.isHeadless||
    !numericEqual(event.headMs,nominalHeadMs)||!numericEqual(event.startMs,nominalHeadMs+branch.delayMs)||
    !numericEqual(event.endMs,nominalHeadMs+branch.delayMs+branch.durationMs)||event.segments.length!==geometries.length)
    throw Error(`Source/cache identity or timing mismatch: ${note.id}:${branchIndex}`);
  const pieces=geometries.map((part,i)=>{
    const original=branch.segments[i]!,cached=event.segments[i]!;
    const start=headMs+part.startMs,end=start+part.durationMs;
    if(cached.code!==original.code||!numericEqual(cached.startMs,start+pseudoEachOffsetMs)||
      !numericEqual(cached.endMs,end+pseudoEachOffsetMs)||!numericEqual(cached.length,part.geometry.length))
      throw Error(`Source/cache segment mismatch: ${note.id}:${branchIndex}:${i}`);
    if(!(part.durationMs>0)||!Number.isFinite(part.durationMs)||!(part.geometry.length>0))
      throw Error(`Non-positive/non-finite motion: ${note.id}:${branchIndex}:${i}`);
    const speed=part.geometry.length/(part.durationMs/1000);
    return {startMs:start,endMs:end,geometry:part.geometry,speed};
  });
  if(pieces.some(p=>p.geometry.wifi)){
    evidence.geometryStatus='fan-unresolved';
  }
  return {evidence,pieces};
}
function pieceAt(branch:Prepared,t:number):Piece {
  return branch.pieces.find(p=>t>=p.startMs&&t<p.endMs)??
    (t<=branch.pieces[0]!.startMs?branch.pieces[0]!:branch.pieces.at(-1)!);
}
function knots(branch:Prepared,start:number,end:number):number[]{
  return branch.pieces.flatMap(p=>[p.startMs,p.endMs,...p.geometry.arrows.map(a=>p.startMs+a.length/p.geometry.length*(p.endMs-p.startMs))])
    .filter(t=>t>=start&&t<=end);
}
function* compare(shouldYield: () => boolean, a:Prepared,b:Prepared):Generator<void, boolean, void> {
  const shorter=a.evidence.endMs-a.evidence.startMs<=b.evidence.endMs-b.evidence.startMs?a:b;
  const duration=shorter.evidence.endMs-shorter.evidence.startMs;
  const start=Math.max(a.evidence.startMs,b.evidence.startMs),end=Math.min(a.evidence.endMs,b.evidence.endMs);
  const startDelta=Math.abs(a.evidence.startMs-b.evidence.startMs)/Math.max(Number.MIN_VALUE,duration);
  if(a.evidence.geometryStatus!=='supported'||b.evidence.geometryStatus!=='supported')return false;
  if(startDelta>SLIDE_ACTION_GROUPS_POLICY.launchToleranceOfShorterDuration)return false;
  if(!(end>start))return false;
  const points=[...new Set([start,end,...knots(a,start,end),...knots(b,start,end)])].sort((x,y)=>x-y);
  let maximumPositionDistance=0,maximumSpeedRatio=1;
  for(const t of points){ if (shouldYield()) yield;
    const pa=pieceAt(a,t),pb=pieceAt(b,t),posa=pathPose(pa.geometry,(t-pa.startMs)/(pa.endMs-pa.startMs)),posb=pathPose(pb.geometry,(t-pb.startMs)/(pb.endMs-pb.startMs));
    maximumPositionDistance=Math.max(maximumPositionDistance,Math.hypot(posa.x-posb.x,posa.y-posb.y));
  }
  for(let i=1;i<points.length;i++){ if (shouldYield()) yield;
    const mid=(points[i-1]!+points[i]!)/2,pa=pieceAt(a,mid),pb=pieceAt(b,mid);
    maximumSpeedRatio=Math.max(maximumSpeedRatio,pa.speed/pb.speed,pb.speed/pa.speed);
  }
  return maximumPositionDistance<=SLIDE_ACTION_GROUPS_POLICY.rendererDiameter*SLIDE_ACTION_GROUPS_POLICY.positionToleranceFraction&&maximumSpeedRatio<=SLIDE_ACTION_GROUPS_POLICY.maximumSpeedRatio;
}

export function* slideActionGroupsCandidate(shouldYield: () => boolean, chart:Chart,events:readonly SlideEvent[]):Generator<void, {groups:SlideActionGroup[]}, void>{
  const timeline=TimingTimeline.fromChart(chart),offset=timeline.msFromBeat(4)-chart.firstMs;
  const cached=new Map<string,SlideEvent>();
  for(const event of events){ if (shouldYield()) yield;const key=`${event.slideId}:${event.branchIndex}`;if(cached.has(key))throw Error(`Duplicate cached branch ${key}`);cached.set(key,event);}
  const groups:SlideActionGroup[]=[];
  for(const note of chart.notes){ if (shouldYield()) yield;
    if(note.type!=='slide'||note.isMine)continue;
    const branches=note.branches.map((_,i)=>prepare(note,i,cached.get(`${note.id}:${i}`),offset));
    const compatibility=new Map<string,boolean>();
    for(let i=0;i<branches.length;i++){ if (shouldYield()) yield; for(let j=i+1;j<branches.length;j++){ if (shouldYield()) yield;
      const shareable=yield* compare(shouldYield, branches[i]!,branches[j]!);
      compatibility.set(`${Math.min(i,j)}:${Math.max(i,j)}`,shareable);
    } }
    // Complete-link prevents two incompatible trajectories being joined through
    // a tolerant intermediary. Longest first gives a full-path representative.
    const sets:Prepared[][]=[];
    for(const branch of [...branches].sort((a,b)=>(b.evidence.endMs-b.evidence.startMs)-(a.evidence.endMs-a.evidence.startMs)||a.evidence.code.localeCompare(b.evidence.code)||a.evidence.branchIndex-b.evidence.branchIndex)){ if (shouldYield()) yield;
      const existing=sets.find(set=>set.every(member=>compatibility.get(`${Math.min(member.evidence.branchIndex,branch.evidence.branchIndex)}:${Math.max(member.evidence.branchIndex,branch.evidence.branchIndex)}`)));
      if(existing)existing.push(branch);else sets.push([branch]);
    }
    const actions=sets.map(set=>({representative:set[0]!.evidence.branchRef}));
    groups.push({slideId:note.id,effectiveActionCount:actions.length,actions});
  }
  return {groups};
}
