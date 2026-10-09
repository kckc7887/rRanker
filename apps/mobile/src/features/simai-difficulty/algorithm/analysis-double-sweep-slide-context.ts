/** DXTag cbea1ff20d69c3eaa163c7d967b708bd076e5d96 (MIT), Copyright (c) 2026 尘言.
 * https://github.com/kckc7887/DXTag — see THIRD_PARTY_NOTICES.md.
 */
/** Source configuration and reading context, not a minimum hand-cost solver.
 * A narrow physical-equal-IOI class: two separated adjacent sweeps include real
 * Slide heads, continue through a waiting TAP chord, then launch together.
 * Other tempo-changing or HOLD/Touch cases require their own relationships.
 */
import {prepareBranch} from '../simai/core/geometry/slidePath';
import type {Chart,Note,SlideNote} from '../simai/types';
import {TimingTimeline} from '../simai/core/timing/TimingTimeline';

export const DOUBLE_SWEEP_SLIDE_CONTEXT_VERSION='double-sweep-slide-context-v2';
export const DOUBLE_SWEEP_SLIDE_CONTEXT_PARAMETERS=Object.freeze({sourceChordGroups:4,minimumPairSeparation:3,
  relativeIOITolerance:.03,maximumLaunchGapIOIs:4,singleBranchSourcesOnly:true});
const EPS=1e-6;
const ring=(a:number,b:number)=>Math.min(Math.abs(a-b),8-Math.abs(a-b));
type Group={ms:number;notes:Note[];positions:number[]};
export function* doubleSweepSlideContext(shouldYield: () => boolean, chart:Chart){
  const p=DOUBLE_SWEEP_SLIDE_CONTEXT_PARAMETERS,timeline=TimingTimeline.fromChart(chart),groups:Group[]=[],
    notes=chart.notes.filter(n=>!n.isMine&&(n.type!=='slide'||!n.isHeadless)),
    ms=(n:Note)=>timeline.audioMsFromScoreBeat(timeline.scoreBeatFromChartMs(n.timingMs-(n.pseudoEachOffsetMs??0)),chart.firstMs);
  // Keep every input in each source group. Do not simplify away simultaneous
  // Touch/HOLD or a third key and then call the remaining pair a simple sweep.
  for(const n of [...notes].sort((a,b)=>ms(a)-ms(b)||String(a.position).localeCompare(String(b.position))||a.id-b.id)){ if (shouldYield()) yield;
    const at=ms(n),last=groups.at(-1);if(last&&Math.abs(last.ms-at)<EPS)last.notes.push(n);
    else groups.push({ms:at,notes:[n],positions:[]});}
  for(const g of groups){ if (shouldYield()) yield; g.positions=[...new Set(g.notes.filter(n=>typeof n.position==='number').map(n=>Number(n.position)))].sort((a,b)=>a-b); }
  let count=0;
  for(let i=3;i<groups.length;i++){ if (shouldYield()) yield;
    const list=groups.slice(i-3,i+1),head=list[2]!,last=list[3]!;
    if(list.some(g=>g.positions.length!==2||g.notes.length!==2||ring(g.positions[0]!,g.positions[1]!)<p.minimumPairSeparation))continue;
    const slides=head.notes.filter((n):n is SlideNote=>n.type==='slide');if(slides.length!==2)continue;
    if(list.some((g,j)=>j!==2&&g.notes.some(n=>!['tap','break'].includes(n.type))))continue;
    const gaps=list.slice(1).map((g,j)=>g.ms-list[j]!.ms),unit=gaps.reduce((x,y)=>x+y,0)/gaps.length;
    if(unit<=EPS||gaps.some(g=>Math.abs(g/unit-1)>p.relativeIOITolerance))continue;
    const mappings:number[][][]=[];
    for(let bits=0;bits<8;bits++){ if (shouldYield()) yield;
      const positions=list.map((g,j)=>j>0&&((bits>>(j-1))&1)!==0?[...g.positions].reverse():g.positions),
        tracks=positions[0]!.map((_,j)=>positions.map(keys=>keys[j]!)),
        steps=tracks.map(path=>path.slice(1).map((key,j)=>(key-path[j]!+8)%8===1?1:(path[j]!-key+8)%8===1?-1:0));
      if(steps.every(path=>path.every(d=>d!==0&&d===path[0])))mappings.push(tracks);
    }
    if(!mappings.length)continue;
    if(slides.some(n=>n.branches.length!==1||n.branches[0]!.segments.length!==1||
      !['-','>','<','^','v','p','pp','q','qq','s','z'].includes(n.branches[0]!.segments[0]!.type))){continue;}
    // Valid parser syntax alone does not establish a drawable/valid path.
    try{for(const n of slides){ if (shouldYield()) yield; prepareBranch(n.branches[0]!); }}catch{continue;}
    const branches=slides.map(n=>({launchMs:head.ms+n.branches[0]!.delayMs,durationMs:n.branches[0]!.durationMs}));
    if(branches.some(b=>b.durationMs<=EPS||b.launchMs<=last.ms+EPS||
      (b.launchMs-last.ms)/unit>p.maximumLaunchGapIOIs+EPS)||Math.abs(branches[0]!.launchMs-branches[1]!.launchMs)>EPS){continue;}
    const ongoingHold=notes.some(n=>(n.type==='hold-start'||n.type==='touch-hold-start')&&ms(n)<last.ms&&
      ms(n)+(n.endTimeMs-n.timingMs)>list[0]!.ms);
    if(ongoingHold)continue;
    count++;
  }
  return count;
}
