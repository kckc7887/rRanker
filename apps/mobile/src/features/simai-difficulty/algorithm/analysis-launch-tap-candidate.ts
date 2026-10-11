/** DXTag cbea1ff20d69c3eaa163c7d967b708bd076e5d96 (MIT), Copyright (c) 2026 尘言.
 * https://github.com/kckc7887/DXTag — see THIRD_PARTY_NOTICES.md.
 */
/** Sources: carmilk's launch-beat/Altale tutorial, and mai-notes タップで発射. */
import type { Chart } from '../simai/types';
import { TimingTimeline } from '../simai/core/timing/TimingTimeline';
import type { SlideEvent } from './types';

export const LAUNCH_TAP_CANDIDATE_SCHEMA = 'launch-tap-candidate-v1';
const near=(a:number,b:number)=>Math.abs(a-b)<=.025;
const distance=(a:number,b:number)=>Math.min(Math.abs(a-b),8-Math.abs(a-b));
type TapPoint={noteId:number;position:number;beat:number;waitPhase:number};
type LaunchTapRelation={headBeat:number;waitBeats:number;tapMovement:number;sharedLaunchContact:boolean;phaseSignature:number[]};
type LaunchTapCandidate={relations:LaunchTapRelation[]};

export function* repeatedLaunchTapCandidate(shouldYield: () => boolean, chart:Chart,events:readonly SlideEvent[]):Generator<void, {
  candidates:LaunchTapCandidate[];
}, void>{
  const timeline=TimingTimeline.fromChart(chart);
  const taps=chart.notes.filter(n=>!n.isMine&&(n.type==='tap'||n.type==='break')).map(n=>({
    noteId:n.id,position:Number(n.position),beat:timeline.beatFromMs(n.timingMs)-4,
  }));
  const byId=new Map<number,SlideEvent[]>();
  for(const event of events){ if (shouldYield()) yield;const branches=byId.get(event.slideId)??[];branches.push(event);byId.set(event.slideId,branches);}
  const relations:LaunchTapRelation[]=[];
  for(const branches of byId.values()){ if (shouldYield()) yield;
    const slide=branches[0]!;if(slide.headless)continue;
    // Simultaneous branch launches share one relation; differing branch launch
    // phases need a separate scheduler and are deliberately not flattened here.
    if(branches.some(b=>Math.abs(b.startBeat-slide.startBeat)>1e-6))continue;
    const waitBeats=slide.startBeat-slide.headBeat;if(waitBeats<=1e-9)continue;
    const window:TapPoint[]=[];
    for (let i=0;i<taps.length;i++) {
      if ((i & 63) === 0) if (shouldYield()) yield;
      const tap=taps[i]!,waitPhase=(tap.beat-slide.headBeat)/waitBeats;
      if (waitPhase>=-1e-6&&waitPhase<=1.025) window.push({...tap,waitPhase});
    }
    window.sort((a,b)=>a.beat-b.beat||a.noteId-b.noteId);
    const launch=window.filter(t=>near(t.waitPhase,1));
    // Chord TAPs need additional assignment evidence; this candidate describes
    // one continuing TAP hand while the other starts the Slide.
    if(launch.length!==1)continue;
    const run:TapPoint[]=[launch[0]!];
    const before=window.filter(t=>t.beat<run[0]!.beat-1e-6);
    if(!before.length)continue;
    let cursor=before.length-1;const step=run[0]!.waitPhase-before[cursor]!.waitPhase;
    if(step<=1e-9)continue;
    while(cursor>=0){ if (shouldYield()) yield;
      const tap=before[cursor]!;
      if(cursor>0&&Math.abs(before[cursor-1]!.beat-tap.beat)<1e-6)break;
      if(!near((run[0]!.waitPhase-tap.waitPhase)/step,1))break;
      run.unshift(tap);cursor--;
    }
    // Three actual TAP onsets, not a Slide head counted as a surrogate TAP.
    if(run.length<3)continue;
    const movements=run.slice(1).map((t,i)=>distance(t.position,run[i]!.position));
    const tapMovement=movements.reduce((sum,n)=>sum+n,0),launchTapHeadDistance=distance(run.at(-1)!.position,slide.headPosition);
    relations.push({headBeat:slide.headBeat,waitBeats,tapMovement,
      sharedLaunchContact:launchTapHeadDistance<=1,phaseSignature:run.map(t=>t.waitPhase)});
  }
  const eligible=relations.filter(r=>!r.sharedLaunchContact&&r.tapMovement>0).sort((a,b)=>a.headBeat-b.headBeat);
  const chains:LaunchTapRelation[][]=[];
  for(const relation of eligible){ if (shouldYield()) yield;
    const compatible=[...chains].reverse().find(chain=>{
      const prior=chain.at(-1)!;
      return relation.headBeat>prior.headBeat+1e-6&&
        (relation.headBeat-prior.headBeat)/Math.max(prior.waitBeats,relation.waitBeats)<=8&&
        relation.phaseSignature.length===prior.phaseSignature.length&&
        relation.phaseSignature.every((phase,i)=>near(phase,prior.phaseSignature[i]!));
    });
    if(compatible)compatible.push(relation);else chains.push([relation]);
  }
  const candidates:LaunchTapCandidate[]=chains.filter(chain=>chain.length>=2).map(relations=>({relations}));
  return {candidates};
}
