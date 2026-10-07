/** DXTag cbea1ff20d69c3eaa163c7d967b708bd076e5d96 (MIT), Copyright (c) 2026 尘言.
 * https://github.com/kckc7887/DXTag — see THIRD_PARTY_NOTICES.md.
 */
/** 拓扑使用谱面拍位置，动作间隔与移动使用音频毫秒。 */
import type { SlideEvent } from './types';

export const SLIDE_HANDOVER_SCHEMA='slide-handover-candidate-v1';
const ringDistance=(a:number,b:number)=>Math.min(Math.abs(a-b),8-Math.abs(a-b));
const endPosition=(e:SlideEvent)=>Number(e.segments.at(-1)!.code.at(-1));
const phaseNear=(actual:number,expected:number)=>Math.abs(actual-expected)<=.025;
export type LaunchHandoverRelation={
  previousSlideId:number;nextSlideId:number;previousBranchIndex:number;nextBranchIndex:number;
  previousHeadBeat:number;launchBeat:number;nextHeadBeat:number;nextLaunchBeat:number;previousEndBeat:number;
  launchMs:number;nextHeadMs:number;previousEndMs:number;nextLaunchMs:number;
  waitPhase:number;headDistance:number;resetDistance:number;resetGapBeats:number;resetGapMs:number;
  previousEndPosition:number;nextHeadPosition:number;
};
type Travel={fromSlideId:number;toSlideId:number;distance:number;availableMs:number;availableBeats:number};
export type HandoverStrategy={
  name:'fixed-slide-hand'|'alternating-slide-hands';travels:Travel[];
  headTravelDistance:number;resetTravelDistance:number;travelCost:number;unavailableTransitions:number;
  limitation:string;
};
export type LaunchHandoverCandidate={
  kind:'launch-reset-chain'|'launch-overlap-chain'|'shared-stroke-chain';candidateAxis:'星星·技巧'|null;
  startMs:number;endMs:number;startBeat:number;endBeat:number;
  slideIds:number[];relations:LaunchHandoverRelation[];strategies:HandoverStrategy[];
  evidenceKind:'interval';status:'requires_player_review';reason:string;
};
function strategy(paths:SlideEvent[],alternate:boolean):HandoverStrategy {
  const travels:Travel[]=[];let headTravelDistance=0,headCost=0;
  if(alternate){
    for(let i=2;i<paths.length;i++){
      const from=paths[i-2]!,to=paths[i]!;
      travels.push({fromSlideId:from.slideId,toSlideId:to.slideId,distance:ringDistance(endPosition(from),to.headPosition),
        availableMs:to.headMs-from.endMs,availableBeats:to.headBeat-from.endBeat});
    }
  }else{
    for(let i=1;i<paths.length;i++){
      const from=paths[i-1]!,to=paths[i]!;
      travels.push({fromSlideId:from.slideId,toSlideId:to.slideId,distance:ringDistance(endPosition(from),to.headPosition),
        availableMs:to.startMs-from.endMs,availableBeats:to.startBeat-from.endBeat});
      const distance=ringDistance(from.headPosition,to.headPosition);headTravelDistance+=distance;
      headCost+=distance*distance/Math.max(.000001,(to.headMs-from.headMs)/1000);
    }
  }
  let travelCost=headCost,unavailableTransitions=0;
  for(const travel of travels){
    if(travel.availableMs < -1e-6 || (travel.distance>0 && travel.availableMs<=1e-6))unavailableTransitions++;
    else if(travel.distance>0)travelCost+=travel.distance*travel.distance/(travel.availableMs/1000);
  }
  return {name:alternate?'alternating-slide-hands':'fixed-slide-hand',travels,headTravelDistance,
    resetTravelDistance:travels.reduce((sum,t)=>sum+t.distance,0),travelCost,unavailableTransitions,
    limitation:'Only this Slide/head chain is scheduled. Other TAP, HOLD, Touch, contact width and judgement tolerances are not solved.'};
}

export function slideLaunchHandover(events:readonly SlideEvent[]):{
  schemaVersion:string;relations:LaunchHandoverRelation[];candidates:LaunchHandoverCandidate[];
  features:Record<string,number>;excludedMultiBranchHeads:number;
} {
  const byId=new Map<number,SlideEvent[]>();
  for(const event of events){const group=byId.get(event.slideId)??[];group.push(event);byId.set(event.slideId,group);}
  const paths=[...byId.values()].filter(g=>g.length===1&&!g[0]!.headless).map(g=>g[0]!).sort((a,b)=>a.headBeat-b.headBeat||a.slideId-b.slideId);
  const allHeadTimes=[...byId.values()].filter(g=>!g[0]!.headless).map(g=>g[0]!.headBeat);
  const relations:LaunchHandoverRelation[]=[];
  for(let i=0;i<paths.length;i++){
    const prior=paths[i]!,span=prior.startBeat-prior.headBeat;
    if(span<=1e-9)continue;
    if(allHeadTimes.filter(beat=>Math.abs(beat-prior.headBeat)<=span*.025).length!==1)continue;
    // One-to-one sequential chains only. Chords/multi-branch heads are explicit
    // unresolved cases, not silently flattened into this two-strategy comparison.
    const next=paths.filter(p=>p.slideId!==prior.slideId&&p.headBeat>prior.headBeat+1e-9&&phaseNear((p.headBeat-prior.headBeat)/span,1));
    if(next.length!==1||allHeadTimes.filter(beat=>phaseNear((beat-prior.headBeat)/span,1)).length!==1)continue;
    const n=next[0]!;
    if(allHeadTimes.some(beat=>beat>prior.headBeat+1e-9&&beat<n.headBeat-span*.025))continue;
    relations.push({previousSlideId:prior.slideId,nextSlideId:n.slideId,previousBranchIndex:prior.branchIndex,nextBranchIndex:n.branchIndex,
      previousHeadBeat:prior.headBeat,launchBeat:prior.startBeat,nextHeadBeat:n.headBeat,nextLaunchBeat:n.startBeat,previousEndBeat:prior.endBeat,
      launchMs:prior.startMs,nextHeadMs:n.headMs,previousEndMs:prior.endMs,nextLaunchMs:n.startMs,
      waitPhase:(n.headBeat-prior.headBeat)/span,headDistance:ringDistance(prior.headPosition,n.headPosition),
      resetDistance:ringDistance(endPosition(prior),n.headPosition),resetGapBeats:n.startBeat-prior.endBeat,resetGapMs:n.startMs-prior.endMs,
      previousEndPosition:endPosition(prior),nextHeadPosition:n.headPosition});
  }
  const byPrevious=new Map(relations.map(r=>[r.previousSlideId,r]));
  const previousIds=new Set(relations.map(r=>r.nextSlideId));
  const candidates:LaunchHandoverCandidate[]=[];
  for(const first of relations.filter(r=>!previousIds.has(r.previousSlideId))){
    const edges:LaunchHandoverRelation[]=[];let current:LaunchHandoverRelation|undefined=first;
    while(current){edges.push(current);current=byPrevious.get(current.nextSlideId);}
    if(edges.length<3)continue;
    const ids=[first.previousSlideId,...edges.map(r=>r.nextSlideId)],chain=ids.map(id=>byId.get(id)![0]!);
    const needsReset=edges.some(r=>r.resetDistance>0),overlap=edges.some(r=>r.resetGapMs < -1e-6);
    candidates.push({kind:needsReset?'launch-reset-chain':overlap?'launch-overlap-chain':'shared-stroke-chain',candidateAxis:needsReset||overlap?'星星·技巧':null,
      startMs:chain[0]!.startMs,endMs:Math.max(...chain.map(p=>p.endMs)),startBeat:chain[0]!.startBeat,endBeat:Math.max(...chain.map(p=>p.endBeat)),
      slideIds:ids,relations:edges,strategies:[strategy(chain,false),strategy(chain,true)],evidenceKind:'interval',status:'requires_player_review',
      reason:needsReset?'连续下一星头落在上一滑动启动拍；滑动终点与后续起点不同，比较固定划手与交替划手的复位。':overlap?'连续下一星头落在上一启动拍，前次划动尚未结束时下一次已启动，需要另行复核双手分配。':'连续下一星头落在上一启动拍且路径首尾衔接；不因连续星头单独判技巧。'});
  }
  const positive=relations.filter(r=>r.resetGapMs>1e-6);
  return {schemaVersion:SLIDE_HANDOVER_SCHEMA,relations,candidates,
    excludedMultiBranchHeads:[...byId.values()].filter(g=>g.length>1).length,
    features:{event_launch_handover_pairs:relations.length,event_launch_handover_head_distance_sum:relations.reduce((s,r)=>s+r.headDistance,0),
      event_launch_handover_reset_distance_sum:relations.reduce((s,r)=>s+r.resetDistance,0),
      event_launch_handover_reset_cost:positive.reduce((s,r)=>s+r.resetDistance*r.resetDistance/(r.resetGapMs/1000),0),
      event_launch_handover_motion_overlap_ms:relations.reduce((s,r)=>s+Math.max(0,-r.resetGapMs),0),
      event_launch_handover_unavailable_resets:relations.filter(r=>r.resetDistance>0&&r.resetGapMs<=1e-6).length,
      event_launch_handover_phase_error_mean:relations.reduce((s,r)=>s+Math.abs(r.waitPhase-1),0)/Math.max(1,relations.length)}};
}
