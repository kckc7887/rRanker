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
type TapPoint={noteId:number;position:number;ms:number;beat:number;waitPhase:number};
export type LaunchTapRelation={
  slideId:number;branchIndices:number[];headPosition:number;headMs:number;headBeat:number;
  launchMs:number;launchBeat:number;endMs:number;endBeat:number;waitMs:number;waitBeats:number;
  taps:TapPoint[];ioiMs:number[];ioiBeats:number[];ioiWaitPhases:number[];
  tapMovement:number;tapMoveSpeed:number;launchTapHeadDistance:number;
  sharedLaunchContact:boolean;phaseSignature:number[];
};
export type LaunchTapCandidate={
  candidateAxis:'星星·技巧';status:'requires_player_review';kind:'repeated-launch-tap-rhythm';
  startMs:number;endMs:number;startBeat:number;endBeat:number;relations:LaunchTapRelation[];
  // Exact per-instance ranges remain distinct: the gap between repetitions is
  // not evidence. A consumer must not light the whole aggregate envelope.
  slideEvidence:{slideId:number;startMs:number;endMs:number;startBeat:number;endBeat:number;anchorMs:number;anchorBeat:number}[];
  tapEvidence:{noteIds:number[];startMs:number;endMs:number;startBeat:number;endBeat:number;movement:number;standaloneAxis:null}[];
  reason:string;limitation:string;
};

export function repeatedLaunchTapCandidate(chart:Chart,events:readonly SlideEvent[]):{
  schemaVersion:string;relations:LaunchTapRelation[];candidates:LaunchTapCandidate[];
}{
  const timeline=TimingTimeline.fromChart(chart),offset=timeline.msFromBeat(4)-chart.firstMs;
  const taps=chart.notes.filter(n=>!n.isMine&&(n.type==='tap'||n.type==='break')).map(n=>({
    noteId:n.id,position:Number(n.position),ms:n.timingMs-offset,beat:timeline.beatFromMs(n.timingMs)-4,
  }));
  const byId=new Map<number,SlideEvent[]>();
  for(const event of events){const branches=byId.get(event.slideId)??[];branches.push(event);byId.set(event.slideId,branches);}
  const relations:LaunchTapRelation[]=[];
  for(const branches of byId.values()){
    const slide=branches[0]!;if(slide.headless)continue;
    // Simultaneous branch launches share one relation; differing branch launch
    // phases need a separate scheduler and are deliberately not flattened here.
    if(branches.some(b=>Math.abs(b.startBeat-slide.startBeat)>1e-6))continue;
    const waitBeats=slide.startBeat-slide.headBeat;if(waitBeats<=1e-9)continue;
    const window=taps.map(t=>({...t,waitPhase:(t.beat-slide.headBeat)/waitBeats}))
      .filter(t=>t.waitPhase>=-1e-6&&t.waitPhase<=1.025).sort((a,b)=>a.beat-b.beat||a.noteId-b.noteId);
    const launch=window.filter(t=>near(t.waitPhase,1));
    // Chord TAPs need additional assignment evidence; this candidate describes
    // one continuing TAP hand while the other starts the Slide.
    if(launch.length!==1)continue;
    const run:TapPoint[]=[launch[0]!];
    const before=window.filter(t=>t.beat<run[0]!.beat-1e-6);
    if(!before.length)continue;
    let cursor=before.length-1;const step=run[0]!.waitPhase-before[cursor]!.waitPhase;
    if(step<=1e-9)continue;
    while(cursor>=0){
      const tap=before[cursor]!;
      if(cursor>0&&Math.abs(before[cursor-1]!.beat-tap.beat)<1e-6)break;
      if(!near((run[0]!.waitPhase-tap.waitPhase)/step,1))break;
      run.unshift(tap);cursor--;
    }
    // Three actual TAP onsets, not a Slide head counted as a surrogate TAP.
    if(run.length<3)continue;
    const ioiMs=run.slice(1).map((t,i)=>t.ms-run[i]!.ms),ioiBeats=run.slice(1).map((t,i)=>t.beat-run[i]!.beat);
    const movements=run.slice(1).map((t,i)=>distance(t.position,run[i]!.position));
    const tapMovement=movements.reduce((sum,n)=>sum+n,0),launchTapHeadDistance=distance(run.at(-1)!.position,slide.headPosition);
    relations.push({slideId:slide.slideId,branchIndices:branches.map(b=>b.branchIndex),headPosition:slide.headPosition,
      headMs:slide.headMs,headBeat:slide.headBeat,launchMs:slide.startMs,launchBeat:slide.startBeat,
      endMs:Math.max(...branches.map(b=>b.endMs)),endBeat:Math.max(...branches.map(b=>b.endBeat)),waitMs:slide.waitMs,waitBeats,taps:run,
      ioiMs,ioiBeats,ioiWaitPhases:run.slice(1).map((t,i)=>t.waitPhase-run[i]!.waitPhase),tapMovement,
      tapMoveSpeed:tapMovement/Math.max(1e-9,(run.at(-1)!.ms-run[0]!.ms)/1000),launchTapHeadDistance,
      // Same head contact can hit the TAP and begin a common stroke. Adjacent
      // contacts are also left for existing specific rules/player review, rather
      // than turning every ordinary TAP+Slide into a new technique label.
      sharedLaunchContact:launchTapHeadDistance<=1,
      phaseSignature:run.map(t=>t.waitPhase)});
  }
  const eligible=relations.filter(r=>!r.sharedLaunchContact&&r.tapMovement>0).sort((a,b)=>a.headBeat-b.headBeat);
  const chains:LaunchTapRelation[][]=[];
  for(const relation of eligible){
    const compatible=[...chains].reverse().find(chain=>{
      const prior=chain.at(-1)!;
      return relation.headBeat>prior.headBeat+1e-6&&
        (relation.headBeat-prior.headBeat)/Math.max(prior.waitBeats,relation.waitBeats)<=8&&
        relation.phaseSignature.length===prior.phaseSignature.length&&
        relation.phaseSignature.every((phase,i)=>near(phase,prior.phaseSignature[i]!));
    });
    if(compatible)compatible.push(relation);else chains.push([relation]);
  }
  const candidates:LaunchTapCandidate[]=chains.filter(chain=>chain.length>=2).map(chain=>({
    candidateAxis:'星星·技巧',status:'requires_player_review',kind:'repeated-launch-tap-rhythm',
    startMs:chain[0]!.headMs,endMs:Math.max(...chain.map(r=>r.endMs)),startBeat:chain[0]!.headBeat,endBeat:Math.max(...chain.map(r=>r.endBeat)),relations:chain,
    slideEvidence:chain.map(r=>({slideId:r.slideId,startMs:r.headMs,endMs:r.endMs,startBeat:r.headBeat,endBeat:r.endBeat,anchorMs:r.launchMs,anchorBeat:r.launchBeat})),
    tapEvidence:chain.map(r=>({noteIds:r.taps.map(t=>t.noteId),startMs:r.taps[0]!.ms,endMs:r.taps.at(-1)!.ms,
      startBeat:r.taps[0]!.beat,endBeat:r.taps.at(-1)!.beat,movement:r.tapMovement,standaloneAxis:null})),
    reason:'连续 TAP 节奏的最后一下反复落在 Slide 启动拍，TAP 已移至另一手位，需同时维持击打节奏并启动划动。',
    limitation:'配置关系候选，不声称最优手序；TAP 证据不单独新增键盘技巧标签，既有键盘证据保留。相邻同拍接触和异时同头分支待专门复核。',
  }));
  return {schemaVersion:LAUNCH_TAP_CANDIDATE_SCHEMA,relations,candidates};
}
