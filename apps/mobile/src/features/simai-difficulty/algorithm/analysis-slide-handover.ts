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
type LaunchHandoverCandidate={candidateAxis:'星星·技巧'|null;relations:LaunchHandoverRelation[]};

export function* slideLaunchHandover(shouldYield: () => boolean, events:readonly SlideEvent[]):Generator<void, {
  candidates:LaunchHandoverCandidate[];
}, void> {
  const byId=new Map<number,SlideEvent[]>();
  for(const event of events){ if (shouldYield()) yield;const group=byId.get(event.slideId)??[];group.push(event);byId.set(event.slideId,group);}
  const paths=[...byId.values()].filter(g=>g.length===1&&!g[0]!.headless).map(g=>g[0]!).sort((a,b)=>a.headBeat-b.headBeat||a.slideId-b.slideId);
  const allHeadTimes=[...byId.values()].filter(g=>!g[0]!.headless).map(g=>g[0]!.headBeat);
  const relations:LaunchHandoverRelation[]=[];
  for(let i=0;i<paths.length;i++){ if (shouldYield()) yield;
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
  for(const first of relations.filter(r=>!previousIds.has(r.previousSlideId))){ if (shouldYield()) yield;
    const edges:LaunchHandoverRelation[]=[];let current:LaunchHandoverRelation|undefined=first;
    while(current){ if (shouldYield()) yield;edges.push(current);current=byPrevious.get(current.nextSlideId);}
    if(edges.length<3)continue;
    const needsReset=edges.some(r=>r.resetDistance>0),overlap=edges.some(r=>r.resetGapMs < -1e-6);
    candidates.push({candidateAxis:needsReset||overlap?'星星·技巧':null,relations:edges});
  }
  return {candidates};
}
