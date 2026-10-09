/** DXTag cbea1ff20d69c3eaa163c7d967b708bd076e5d96 (MIT), Copyright (c) 2026 尘言.
 * https://github.com/kckc7887/DXTag — see THIRD_PARTY_NOTICES.md.
 */
/** Continuous input/held-hand observations. Touch is an attack, Touch HOLD an
 * occupied interval at its actual sensor, not an outer-button number. No
 * classifier, level, reference, title or feedback is an input.
 * Simai: https://w.atwiki.jp/simai/pages/1002.html#id_423ee98c */
import type {Chart,Note} from '../simai/types';
import {TimingTimeline} from '../simai/core/timing/TimingTimeline';
import {inputOnsets,inputDistance,chordMovement,type KeyboardRhythmOnset} from './rhythm-complexity';
export const INPUT_COMPLEXITY_VERSION='input-complexity-v1';
export const INPUT_COMPLEXITY_POLICY=Object.freeze({version:INPUT_COMPLEXITY_VERSION,
  lock:'log1p(held seconds)*log1p(foreign attack count)*log1p(actual onset rate)*duration/(duration+local IOI); movement and overlapping holds add planning load',
  touch:'sqrt(Touch attacks)*(1+log1p(actual Touch onset rate))*(1+nominal movement/4)',
  geometry:'button pairs retain ring steps; Touch pairs use sensor coordinates; separated-hold pressure is continuous, not an impossible-hand verdict',
  shortHold:'duration/(duration+local IOI) attenuates short/pseudo HOLD occupancy; no fixed-ms rhythm gate or mandatory hold assertion',
  aggregate:'sum lock windows / sqrt(window count); source intervals, no empty gap merged into a lock',
  limitations:'Uncalibrated workload proxy; no optimal palm/contact assignment, physical judgement or reaction-time claim'});
type LockInput={kind:Note['type'];pressure:number};
export type InputComplexityResult={raw:number;touchRaw:number};
const EPS=1e-7,mean=(xs:number[])=>xs.reduce((a,b)=>a+b,0)/Math.max(1,xs.length);
export function* inputComplexity(shouldYield: () => boolean, chart:Chart):Generator<void, InputComplexityResult, void>{
  const timeline=TimingTimeline.fromChart(chart),onsets=(yield* inputOnsets(shouldYield, chart,true,true)),notes=new Map(chart.notes.map(n=>[n.id,n])),
    audio=(n:Note)=>n.timingMs-timeline.msFromBeat(4)+chart.firstMs,
    holds=[...new Map(chart.notes.filter(n=>!n.isMine&&(n.type==='hold-start'||n.type==='touch-hold-start')&&n.endTimeMs>n.timingMs).map(n=>[n.id,n])).values()]
      .map(note=>({note,start:audio(note),end:audio(note)+note.endTimeMs-note.timingMs})),windows:number[]=[];
  for(const h of holds){ if (shouldYield()) yield;
    const groups:KeyboardRhythmOnset[]=onsets.filter(o=>o.ms>=h.start-EPS&&o.ms<h.end-EPS).flatMap(o=>{
      const indexes=o.noteIds.map((id,i)=>id===h.note.id?-1:i).filter(i=>i>=0);
      return indexes.length?[{...o,noteIds:indexes.map(i=>o.noteIds[i]!),positions:indexes.map(i=>o.positions[i]!),
        kinds:indexes.map(i=>o.kinds[i]!)}]:[];});
    if(!groups.length)continue;
    const duration=(h.end-h.start)/1000,ioi=groups.length>1?(groups.at(-1)!.ms-groups[0]!.ms)/(groups.length-1)/1000:duration,
      occupancy=duration/(duration+Math.max(EPS,ioi)),noteIds=[...new Set(groups.flatMap(o=>o.noteIds))],onsetRate=groups.length/duration,
      movementMean=mean(groups.slice(1).map((o,i)=>chordMovement(groups[i]!,o))),inputs:LockInput[]=[];
    for(const group of groups){ if (shouldYield()) yield; for(const noteId of group.noteIds){ if (shouldYield()) yield;
      const n=notes.get(noteId)!,active=holds.filter(other=>other.start<=group.ms+EPS&&other.end>group.ms+EPS),
        otherHolds=active.filter(other=>other.note.id!==h.note.id&&other.note.id!==noteId),
        pressure=otherHolds.reduce((s,other)=>{const distance=inputDistance(h.note.position,other.note.position);
          return s+distance/(1+distance)*((other.end-other.start)/(other.end-other.start+Math.max(EPS,ioi*1000)));},0);
      inputs.push({kind:n.type,pressure});
    } }
    // Only Touch-coupled HOLD load supplements the all-library button analysis.
    if(h.note.type!=='touch-hold-start'&&!inputs.some(i=>i.kind==='touch'||i.kind==='touch-hold-start'))continue;
    const sustained=Math.log1p(duration)*Math.log1p(noteIds.length)*Math.log1p(onsetRate)*occupancy,
      movement=sustained*movementMean/4,coordination=sustained*mean(inputs.map(i=>i.pressure));
    windows.push(sustained+movement+coordination);
  }
  const touches=onsets.flatMap(o=>{const indexes=o.kinds.map((kind,i)=>kind==='touch'||kind==='touch-hold-start'?i:-1).filter(i=>i>=0);
    return indexes.length?[{...o,noteIds:indexes.map(i=>o.noteIds[i]!),positions:indexes.map(i=>o.positions[i]!)}]:[];});
  const touchCount=touches.reduce((s,o)=>s+o.noteIds.length,0),seconds=touches.length>1?(touches.at(-1)!.ms-touches[0]!.ms)/1000:0,
    movement=mean(touches.slice(1).map((o,i)=>chordMovement(touches[i]!,o))),
    touchRaw=Math.sqrt(touchCount)*(1+Math.log1p(seconds>EPS?(touches.length-1)/seconds:0))*(1+movement/4),
    raw=windows.reduce((s,w)=>s+w,0)/Math.sqrt(Math.max(1,windows.length));
  if(![raw,touchRaw,...windows].every(Number.isFinite))throw Error('Non-finite input complexity');
  return {raw,touchRaw};
}
