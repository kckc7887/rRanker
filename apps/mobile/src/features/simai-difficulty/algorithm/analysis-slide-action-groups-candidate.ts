/** DXTag cbea1ff20d69c3eaa163c7d967b708bd076e5d96 (MIT), Copyright (c) 2026 尘言.
 * https://github.com/kckc7887/DXTag — see THIRD_PARTY_NOTICES.md.
 */
/** 同时同速的完整短轨迹可与长轨迹前缀重合；逐折点比较，避免重复计算重合动作。 */
import type {Chart, SlideNote, SourceLocation} from '../simai/types';
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
export type ActionBranchEvidence = {
  slideId:number; branchIndex:number; branchRef:string; code:string;
  source:SourceLocation; headless:boolean; pseudoEachOffsetMs:number;
  nominalHeadMs:number; headMs:number; startMs:number; endMs:number;
  headBeat:number; startBeat:number; endBeat:number;
  geometryStatus:'supported'|'fan-unresolved'|'unsupported'; reason:string|null;
  actionId:string; pathLength:number;
  segments:{code:string; startMs:number; endMs:number; startBeat:number; endBeat:number; length:number; speed:number; durationSpec:unknown}[];
};
export type ActionPairEvidence = {
  branches:[string,string]; shorterBranch:string; longerBranch:string;
  shareable:boolean; reason:string; startDeltaOfShorterDuration:number;
  commonStartMs:number; commonEndMs:number; commonStartBeat:number; commonEndBeat:number;
  maximumPositionDistance:number|null; maximumSpeedRatio:number|null;
  knotCount:number; positionTolerance:number;
};
export type SlideActionGroupEvidence = {
  slideId:number; source:SourceLocation; headless:boolean; pseudoEachOffsetMs:number;
  rawBranchCount:number; effectiveActionCount:number;
  branches:ActionBranchEvidence[]; pairs:ActionPairEvidence[];
  actions:{actionId:string; branches:string[]; representative:string; startMs:number; endMs:number; startBeat:number; endBeat:number; pathLength:number; reason:string}[];
};
type Prepared = {evidence:ActionBranchEvidence; pieces:Piece[]};
const numericEqual=(a:number,b:number)=>Math.abs(a-b)<=SLIDE_ACTION_GROUPS_POLICY.numericalRelativeTolerance*Math.max(1,Math.abs(a),Math.abs(b));
const quantile=(xs:number[],p:number)=>xs.length?[...xs].sort((a,b)=>a-b)[Math.floor((xs.length-1)*p)]!:0;

function prepare(note:SlideNote, branchIndex:number, event:SlideEvent|undefined, timeline:TimingTimeline, offset:number, firstMs:number):Prepared {
  const branch=note.branches[branchIndex]!, pseudoEachOffsetMs=note.pseudoEachOffsetMs??0;
  const nominalHeadMs=note.timingMs-offset,headMs=nominalHeadMs-pseudoEachOffsetMs;
  const startMs=headMs+branch.delayMs,endMs=startMs+branch.durationMs;
  const beat=(t:number)=>timeline.scoreBeatFromAudioMs(t,firstMs);
  const evidence:ActionBranchEvidence={slideId:note.id,branchIndex,branchRef:`${note.id}:${branchIndex}`,
    code:branch.segments.map(s=>s.code).join('→'),source:{...note.source},headless:note.isHeadless,pseudoEachOffsetMs,
    nominalHeadMs,headMs,startMs,endMs,headBeat:beat(headMs),startBeat:beat(startMs),endBeat:beat(endMs),
    geometryStatus:'supported',reason:null,actionId:'',pathLength:0,segments:[]};
  let geometries:ReturnType<typeof prepareBranch>;
  try{geometries=prepareBranch(branch);}catch(error){
    evidence.geometryStatus='unsupported';evidence.reason=String(error);
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
    evidence.pathLength+=part.geometry.length;
    evidence.segments.push({code:original.code,startMs:start,endMs:end,startBeat:beat(start),endBeat:beat(end),length:part.geometry.length,speed,durationSpec:original.durationSpec??null});
    return {startMs:start,endMs:end,geometry:part.geometry,speed};
  });
  if(pieces.some(p=>p.geometry.wifi)){
    evidence.geometryStatus='fan-unresolved';evidence.reason='Fan side lanes are not represented by a single center trajectory';
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
function compare(a:Prepared,b:Prepared,timeline:TimingTimeline,firstMs:number):ActionPairEvidence {
  const shorter=a.evidence.endMs-a.evidence.startMs<=b.evidence.endMs-b.evidence.startMs?a:b,longer=shorter===a?b:a;
  const duration=shorter.evidence.endMs-shorter.evidence.startMs;
  const start=Math.max(a.evidence.startMs,b.evidence.startMs),end=Math.min(a.evidence.endMs,b.evidence.endMs);
  const result:ActionPairEvidence={branches:[a.evidence.branchRef,b.evidence.branchRef],shorterBranch:shorter.evidence.branchRef,longerBranch:longer.evidence.branchRef,
    shareable:false,reason:'',startDeltaOfShorterDuration:Math.abs(a.evidence.startMs-b.evidence.startMs)/Math.max(Number.MIN_VALUE,duration),
    commonStartMs:start,commonEndMs:Math.max(start,end),commonStartBeat:timeline.scoreBeatFromAudioMs(start,firstMs),
    commonEndBeat:timeline.scoreBeatFromAudioMs(Math.max(start,end),firstMs),maximumPositionDistance:null,maximumSpeedRatio:null,knotCount:0,
    positionTolerance:SLIDE_ACTION_GROUPS_POLICY.rendererDiameter*SLIDE_ACTION_GROUPS_POLICY.positionToleranceFraction};
  if(a.evidence.geometryStatus!=='supported'||b.evidence.geometryStatus!=='supported'){result.reason='unresolved-geometry';return result;}
  if(result.startDeltaOfShorterDuration>SLIDE_ACTION_GROUPS_POLICY.launchToleranceOfShorterDuration){result.reason='different-launch-time';return result;}
  if(!(end>start)){result.reason='no-moving-overlap';return result;}
  const points=[...new Set([start,end,...knots(a,start,end),...knots(b,start,end)])].sort((x,y)=>x-y);
  let maximumPositionDistance=0,maximumSpeedRatio=1;
  for(const t of points){
    const pa=pieceAt(a,t),pb=pieceAt(b,t),posa=pathPose(pa.geometry,(t-pa.startMs)/(pa.endMs-pa.startMs)),posb=pathPose(pb.geometry,(t-pb.startMs)/(pb.endMs-pb.startMs));
    maximumPositionDistance=Math.max(maximumPositionDistance,Math.hypot(posa.x-posb.x,posa.y-posb.y));
  }
  for(let i=1;i<points.length;i++){
    const mid=(points[i-1]!+points[i]!)/2,pa=pieceAt(a,mid),pb=pieceAt(b,mid);
    maximumSpeedRatio=Math.max(maximumSpeedRatio,pa.speed/pb.speed,pb.speed/pa.speed);
  }
  Object.assign(result,{maximumPositionDistance,maximumSpeedRatio,knotCount:points.length});
  result.shareable=maximumPositionDistance<=result.positionTolerance&&maximumSpeedRatio<=SLIDE_ACTION_GROUPS_POLICY.maximumSpeedRatio;
  result.reason=result.shareable?'complete-shorter-path-coincident-prefix':maximumSpeedRatio>SLIDE_ACTION_GROUPS_POLICY.maximumSpeedRatio?'different-motion-speed':'separated-or-diverging-path';
  return result;
}

export function slideActionGroupsCandidate(chart:Chart,events:readonly SlideEvent[]):{version:string;policy:typeof SLIDE_ACTION_GROUPS_POLICY;features:Record<string,number>;groups:SlideActionGroupEvidence[]}{
  const timeline=TimingTimeline.fromChart(chart),offset=timeline.msFromBeat(4)-chart.firstMs;
  const cached=new Map<string,SlideEvent>();
  for(const event of events){const key=`${event.slideId}:${event.branchIndex}`;if(cached.has(key))throw Error(`Duplicate cached branch ${key}`);cached.set(key,event);}
  const groups:SlideActionGroupEvidence[]=[],allActions:SlideActionGroupEvidence['actions']=[];
  let rawPathWork=0,effectivePathWork=0,rawMotionMs=0,effectiveMotionMs=0,compatiblePairs=0;
  let unresolved=0,multipleSourceGroups=0;
  for(const note of chart.notes){
    if(note.type!=='slide'||note.isMine)continue;
    const branches=note.branches.map((_,i)=>prepare(note,i,cached.get(`${note.id}:${i}`),timeline,offset,chart.firstMs));
    const pairs:ActionPairEvidence[]=[],compatibility=new Map<string,boolean>();
    for(let i=0;i<branches.length;i++)for(let j=i+1;j<branches.length;j++){
      const pair=compare(branches[i]!,branches[j]!,timeline,chart.firstMs);pairs.push(pair);if(pair.shareable)compatiblePairs++;
      compatibility.set(`${Math.min(i,j)}:${Math.max(i,j)}`,pair.shareable);
    }
    // Complete-link prevents two incompatible trajectories being joined through
    // a tolerant intermediary. Longest first gives a full-path representative.
    const sets:Prepared[][]=[];
    for(const branch of [...branches].sort((a,b)=>(b.evidence.endMs-b.evidence.startMs)-(a.evidence.endMs-a.evidence.startMs)||a.evidence.code.localeCompare(b.evidence.code)||a.evidence.branchIndex-b.evidence.branchIndex)){
      const existing=sets.find(set=>set.every(member=>compatibility.get(`${Math.min(member.evidence.branchIndex,branch.evidence.branchIndex)}:${Math.max(member.evidence.branchIndex,branch.evidence.branchIndex)}`)));
      if(existing)existing.push(branch);else sets.push([branch]);
    }
    const actions=sets.map((set,i)=>{
      const representative=set[0]!.evidence,actionId=`${note.id}:action:${i}`;
      for(const branch of set)branch.evidence.actionId=actionId;
      const action={actionId,branches:set.map(b=>b.evidence.branchRef).sort(),representative:representative.branchRef,startMs:representative.startMs,endMs:representative.endMs,
        startBeat:representative.startBeat,endBeat:representative.endBeat,pathLength:representative.pathLength,
        reason:set.length>1?'geometry-coincident-prefix-candidate':representative.geometryStatus==='supported'?'independent-source-branch':'unresolved-conservative-singleton'};
      effectivePathWork+=action.pathLength;effectiveMotionMs+=action.endMs-action.startMs;return action;
    });
    for(const branch of branches){rawPathWork+=branch.evidence.pathLength;rawMotionMs+=branch.evidence.endMs-branch.evidence.startMs;if(branch.evidence.geometryStatus!=='supported')unresolved++;}
    if(branches.length>1)multipleSourceGroups++;
    groups.push({slideId:note.id,source:{...note.source},headless:note.isHeadless,pseudoEachOffsetMs:note.pseudoEachOffsetMs??0,
      rawBranchCount:branches.length,effectiveActionCount:actions.length,branches:branches.map(b=>b.evidence),pairs,actions});
    allActions.push(...actions);
  }
  const rawBranches=groups.reduce((sum,g)=>sum+g.rawBranchCount,0),effectiveActions=allActions.length;
  const ticks=allActions.flatMap(a=>[{time:a.startMs,delta:1},{time:a.endMs,delta:-1}]).sort((a,b)=>a.time-b.time||a.delta-b.delta);
  let active=0,peak=0;for(const tick of ticks){active+=tick.delta;peak=Math.max(peak,active);}
  const ratio=[...allActions].map(a=>(a.endMs-a.startMs)/1000),counts=groups.map(g=>g.effectiveActionCount);
  return {version:SLIDE_ACTION_GROUPS_VERSION,policy:SLIDE_ACTION_GROUPS_POLICY,groups,features:{
    candidate_slide_action_raw_source_groups:groups.length,candidate_slide_action_multi_branch_source_groups:multipleSourceGroups,
    candidate_slide_action_raw_branches:rawBranches,candidate_slide_action_effective_actions:effectiveActions,
    candidate_slide_action_shared_branch_savings:rawBranches-effectiveActions,
    candidate_slide_action_shared_branch_fraction:rawBranches?(rawBranches-effectiveActions)/rawBranches:0,
    candidate_slide_action_compatible_pairs:compatiblePairs,candidate_slide_action_unresolved_branches:unresolved,
    candidate_slide_action_raw_path_length:rawPathWork,candidate_slide_action_effective_path_length:effectivePathWork,
    candidate_slide_action_raw_motion_ms:rawMotionMs,candidate_slide_action_effective_motion_ms:effectiveMotionMs,
    candidate_slide_action_concurrency_peak:peak,candidate_slide_action_per_source_max:Math.max(0,...counts),
    candidate_slide_action_duration_p50_s:quantile(ratio,.5),candidate_slide_action_duration_p90_s:quantile(ratio,.9),
  }};
}
