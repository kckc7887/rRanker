/** DXTag cbea1ff20d69c3eaa163c7d967b708bd076e5d96 (MIT), Copyright (c) 2026 尘言.
 * https://github.com/kckc7887/DXTag — see THIRD_PARTY_NOTICES.md.
 */
/** Independent continuous Slide workload / structure proxy, not player anatomy
 * or a fitted difficulty model. Simai: https://w.atwiki.jp/simai/pages/1002.html
 * Geometry is computed from local line/circle primitives; no rule/axis/tag is consulted. */
import type {Chart,Note,SlideNote} from '../simai/types';
import {buttonPoint,touchPoint,prepareBranch,pathPose,type Geometry} from '../simai/core/geometry/slidePath';
import {TimingTimeline} from '../simai/core/timing/TimingTimeline';
import type {SlideEvent} from './types';
import {rhythmComplexity} from './rhythm-complexity';

export const STAR_COMPLEXITY_VERSION='star-complexity-v3';
export const STAR_COMPLEXITY_POLICY=Object.freeze({version:STAR_COMPLEXITY_VERSION,coreBeats:16,stepBeats:4,contextBeats:2,
  trajectorySamples:32,pairSamples:8,rendererDiameter:9.6,geometryDuplicateTolerance:1e-7,
  weights:{motion:1,rhythm:.7,coordination:1.2,context:1.5},techniqueWeights:{motion:.15,rhythm:.7,coordination:1.2,context:1.5},
  waiting:'base=log1p(true contact count)*log1p(structural onset count / physical wait seconds); context += .5*base; rhythm += .5*base*beat irregularity',
  tracking:'log1p(actual moving seconds)*sqrt(1+path length/diameter); sustained following, not inverse-speed or a stamina label',
  headReturn:'3*origin affinity*path separation/diameter*(1+log1p(remaining seconds))*(1+log1p(overlapping HOLD seconds)); foreign contacts only during actual motion',
  burst:'four-score-beat profile; rise=max(0,current raw-previous raw), including empty recovery blocks; peak rise is support, not a class label',
  aggregation:'sum / sqrt(unique trajectories)',
  fan:'centerline motion plus nominal three-terminal span; not three human hands or complete fan contacts',
  coverage:'exact source/cache branch identity and physical segment timing/length; unresolved is null, never zero',
  structure:'score beat ratios; pseudo-EACH removed only for structural coordinates, retained for physical movement',
  context:'actual Slide tracking, origin reoccupation, waiting and before/after continuation; planning proxies, not mandatory hand assignments',
  limitations:'Heuristic weights, sampled curvature and approximate path geometry; sqrt(N) length load, not intrinsic entropy; no judgement or optimal hand solver; not calibrated',
});
export type StarComponents={motion:number;rhythm:number;coordination:number;context:number};
export type StarWaiting={noteCount:number;onsetCount:number;rate:number;irregularity:number;raw:number;noteIds:number[];durationMs:number;onsetBeats:number[]};
type StarHeadReturn={noteId:number;atBeat:number;endBeat:number;raw:number};
export type StarComplexityResult={raw:number|null;techniqueRaw:number|null;burstRaw:number|null;coverage:{expectedBranches:number;observedBranches:number;complete:boolean}};
type Point={x:number;y:number};
type Piece={start:number;end:number;geometry:Geometry};
type Contact={note:Note;ms:number;end:number;beat:number;endBeat:number;point:Point};
type Action={keys:string[];ids:number[];head:number;headPosition:number;hasHead:boolean;start:number;end:number;headBeat:number;startBeat:number;endBeat:number;
  pulseBeat:number;pieces:Piece[];sample:Point[];length:number;fanSpan:number;parts:StarComponents;context:Contact[];contextCouplings:Map<number,number>;
  waiting:StarWaiting;waitingRhythm:number;headReturns:StarHeadReturn[]};
const EPS=1e-7,zero=():StarComponents=>({motion:0,rhythm:0,coordination:0,context:0});
const norm=(a:Point)=>Math.hypot(a.x,a.y),sub=(a:Point,b:Point):Point=>({x:a.x-b.x,y:a.y-b.y});
const mean=(xs:number[])=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:0;
const median=(xs:number[])=>xs.length?[...xs].sort((a,b)=>a-b)[Math.floor(xs.length/2)]!:0;
const equal=(a:number,b:number)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=EPS*Math.max(1,Math.abs(a),Math.abs(b));
const angle=(a:Point,b:Point)=>norm(a)*norm(b)>EPS?Math.acos(Math.max(-1,Math.min(1,(a.x*b.x+a.y*b.y)/(norm(a)*norm(b))))):0;
const total=(c:StarComponents)=>Object.entries(STAR_COMPLEXITY_POLICY.weights).reduce((s,[k,w])=>s+w*c[k as keyof StarComponents],0);
const technique=(c:StarComponents)=>Object.entries(STAR_COMPLEXITY_POLICY.techniqueWeights).reduce((s,[k,w])=>s+w*c[k as keyof StarComponents],0);
const emptyWaiting=():StarWaiting=>({noteCount:0,onsetCount:0,rate:0,irregularity:0,raw:0,noteIds:[],durationMs:0,onsetBeats:[]});
function pose(action:Action,ms:number):Point{
  let lo=0,hi=action.pieces.length-1;
  while(lo<hi){const mid=(lo+hi)>>1;if(action.pieces[mid]!.end<ms)lo=mid+1;else hi=mid;}
  const p=action.pieces[lo]!;return pathPose(p.geometry,(ms-p.start)/(p.end-p.start));
}
function firstAt(contacts:Contact[],beat:number){let lo=0,hi=contacts.length;
  while(lo<hi){const m=(lo+hi)>>1;if(contacts[m]!.beat<beat)lo=m+1;else hi=m;}return lo;}

export function* starComplexity(shouldYield: () => boolean, chart:Chart,events:readonly SlideEvent[]):Generator<void, StarComplexityResult, void>{
  const policy=STAR_COMPLEXITY_POLICY,timeline=TimingTimeline.fromChart(chart),diameter=policy.rendererDiameter,
    beat=(ms:number)=>timeline.scoreBeatFromAudioMs(ms,chart.firstMs),audio=(n:Note)=>n.timingMs-timeline.msFromBeat(4)+chart.firstMs,
    structural=(n:Note)=>timeline.scoreBeatFromChartMs(n.timingMs-(n.pseudoEachOffsetMs??0));
  const slides=chart.notes.filter((n):n is SlideNote=>n.type==='slide'&&!n.isMine),
    expectedBranches=slides.reduce((s,n)=>s+n.branches.length,0),cache=new Map<string,SlideEvent>();
  let complete=true,observedBranches=0;
  for(const e of events){ if (shouldYield()) yield;const key=`${e.slideId}:${e.branchIndex}`;if(cache.has(key))complete=false;cache.set(key,e);}
  const actions:Action[]=[],buckets=new Map<string,Action[]>();
  for(const note of slides){ if (shouldYield()) yield; for(const [index,branch] of note.branches.entries()){ if (shouldYield()) yield;
    const key=`${note.id}:${index}`,event=cache.get(key),head=audio(note),start=head+branch.delayMs,end=start+branch.durationMs;
    let prepared:ReturnType<typeof prepareBranch>;
    try{prepared=prepareBranch(branch);}catch{complete=false;continue;}
    if(!event||!(branch.durationMs>0)||!Number.isFinite(end)||!Number.isFinite(head)||!prepared.length||!equal(event.headMs,head)||!equal(event.startMs,start)||!equal(event.endMs,end)||
      event.headPosition!==note.position||event.headless!==note.isHeadless||event.segments.length!==prepared.length||
      prepared.some((p,j)=>!equal(event.segments[j]!.startMs,head+p.startMs)||!equal(event.segments[j]!.endMs,head+p.startMs+p.durationMs)||
        !equal(event.segments[j]!.length,p.geometry.length)||event.segments[j]!.code!==branch.segments[j]!.code||!(p.durationMs>0)||
        !Number.isFinite(p.durationMs)||!(p.geometry.length>0)||!Number.isFinite(p.geometry.length))){complete=false;continue;}
    observedBranches++;
    const pieces=prepared.map(p=>({start:head+p.startMs,end:head+p.startMs+p.durationMs,geometry:p.geometry})),
      length=pieces.reduce((s,p)=>s+p.geometry.length,0),headBeat=structural(note),pseudo=note.pseudoEachOffsetMs??0,
      startBeat=beat(start-pseudo),endBeat=beat(end-pseudo),fanSegments=branch.segments.filter(s=>s.type==='w'),
      fanSpan=fanSegments.reduce((sum,s)=>sum+norm(sub(buttonPoint((s.endPos+6)%8+1),buttonPoint(s.endPos%8+1)))/diameter,0),
      pulseBeat=Math.max(EPS,beat(head-pseudo+(branch.delayMs>0?branch.delayMs:branch.durationMs))-headBeat);
    const action:Action={keys:[key],ids:[note.id],head,headPosition:note.position,hasHead:!note.isHeadless,start,end,headBeat,startBeat,endBeat,pulseBeat,pieces,sample:[],length,fanSpan,parts:zero(),context:[],contextCouplings:new Map(),waiting:emptyWaiting(),waitingRhythm:0,headReturns:[]};
    for(let i=0;i<=policy.trajectorySamples;i++){ if (shouldYield()) yield; action.sample.push(pose(action,start+(end-start)*i/policy.trajectorySamples)); }
    if(action.sample.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y))){complete=false;continue;}
    // Cross-source duplicates are geometric coincidences, not two independent
    // human paths. Complete timed trajectories only; prefixes remain separate.
    const bucketKey=[head,start,end].map(n=>Math.round(n*1e6)).join(':'),bucket=buckets.get(bucketKey)??[],
      duplicate=bucket.find(a=>equal(a.fanSpan,fanSpan)&&equal(a.length,length)&&a.sample.every((p,j)=>norm(sub(p,action.sample[j]!))<policy.geometryDuplicateTolerance));
    if(duplicate){duplicate.keys.push(key);duplicate.ids.push(note.id);duplicate.hasHead ||= !note.isHeadless;continue;}
    bucket.push(action);buckets.set(bucketKey,bucket);actions.push(action);
    const vectors=action.sample.slice(1).map((p,j)=>sub(p,action.sample[j]!)),
      curvature=vectors.slice(1).reduce((s,v,j)=>s+angle(vectors[j]!,v),0)/Math.PI,
      speed=length/diameter/((end-start)/1000),speedLogs=pieces.map(p=>Math.log(p.geometry.length/(p.end-p.start))),
      speedMean=pieces.reduce((s,p,j)=>s+speedLogs[j]!*(p.end-p.start)/(end-start),0),
      speedVariation=pieces.reduce((s,p,j)=>s+Math.abs(speedLogs[j]!-speedMean)*(p.end-p.start)/(end-start),0);
    action.parts.motion=(length/diameter)*(1+Math.log1p(speed))*(1+.35*curvature+.4*fanSpan);
    action.parts.rhythm=.3*speedVariation;
  } }
  if(cache.size!==expectedBranches||observedBranches!==expectedBranches)complete=false;
  const coverage={expectedBranches,observedBranches,complete};
  if(!complete)return {raw:null,techniqueRaw:null,burstRaw:null,coverage};
  if(!actions.length)return {raw:0,techniqueRaw:0,burstRaw:0,coverage};
  actions.sort((a,b)=>a.start-b.start||a.end-b.end);
  const launches=[...new Set(actions.map(a=>a.startBeat))].sort((a,b)=>a-b),
    launchGaps=launches.slice(1).map((v,i)=>v-launches[i]!);
  for(const action of actions){ if (shouldYield()) yield;
    const i=launches.indexOf(action.startBeat),near=launchGaps.slice(Math.max(0,i-2),Math.min(launchGaps.length,i+2)),unit=median(near)||action.pulseBeat,
      phase=(action.startBeat-action.headBeat)/unit;
    action.parts.rhythm+=Math.abs(Math.sin(Math.PI*phase))*.35+
      mean(near.slice(1).map((v,j)=>Math.abs(Math.log2(v/near[j]!))));
  }
  // Interval sweep examines actual moving overlaps only; no minimum ms gate.
  let active:Action[]=[];
  for(const a of actions){ if (shouldYield()) yield;active=active.filter(b=>b.end>a.start);
    for(const b of active){ if (shouldYield()) yield;const from=Math.max(a.start,b.start),to=Math.min(a.end,b.end);if(to<=from)continue;
      let independence=0;
      for(let j=0;j<policy.pairSamples;j++){ if (shouldYield()) yield;
        const t=from+(to-from)*(j+.5)/policy.pairSamples,dt=(to-from)/policy.pairSamples/4,
          ap=pose(a,t),bp=pose(b,t),av=sub(pose(a,t+dt),pose(a,t-dt)),bv=sub(pose(b,t+dt),pose(b,t-dt));
        independence+=norm(sub(ap,bp))/diameter+.35*angle(av,bv)/Math.PI;
      }
      const overlap=(to-from)/Math.sqrt((a.end-a.start)*(b.end-b.start)),
        speedDifference=Math.abs(Math.log2((a.length/(a.end-a.start))/(b.length/(b.end-b.start)))),
        coordination=overlap*(.2+independence/policy.pairSamples+.2*speedDifference+.2*Math.abs(a.start-b.start)/Math.sqrt((a.end-a.start)*(b.end-b.start)));
      a.parts.coordination+=coordination/2;b.parts.coordination+=coordination/2;
      a.parts.rhythm+=overlap*speedDifference*.15;b.parts.rhythm+=overlap*speedDifference*.15;
    }active.push(a);
  }
  const contacts:Contact[]=chart.notes.filter(n=>!n.isMine&&!(n.type==='slide'&&n.isHeadless)).map(note=>({note,
    ms:audio(note),end:audio(note)+note.endTimeMs-note.timingMs,beat:structural(note),
    endBeat:beat(audio(note)+note.endTimeMs-note.timingMs-(note.pseudoEachOffsetMs??0)),
    point:typeof note.position==='number'?buttonPoint(note.position):touchPoint(note.position)})).sort((a,b)=>a.beat-b.beat),
    holds=contacts.filter(c=>c.note.type==='hold-start'||c.note.type==='touch-hold-start');
  const moving=(a:Action,bounds?:[number,number])=>Math.max(0,Math.min(a.end,bounds?timeline.audioMsFromScoreBeat(bounds[1],chart.firstMs):Infinity)
    -Math.max(a.start,bounds?timeline.audioMsFromScoreBeat(bounds[0],chart.firstMs):-Infinity));
  const tracking=(a:Action,bounds?:[number,number])=>Math.log1p(moving(a,bounds)/1000)*Math.sqrt(1+a.length/diameter);
  const headReturn=(a:Action,c:Contact,bounds?:[number,number]):StarHeadReturn|null=>{
    if(!a.hasHead)return null;
    // The original button's neighbourhood has a finite geometric support:
    // half the adjacent-button chord. A nearby A Touch can share it; a far
    // TAP cannot become an origin return merely because a Slide is moving.
    const origin=buttonPoint(a.headPosition),radius=norm(sub(origin,buttonPoint(a.headPosition%8+1)))/2,
      affinity=Math.max(0,1-Math.pow(norm(sub(origin,c.point))/radius,2)),
      held=c.note.type==='hold-start'||c.note.type==='touch-hold-start',
      pseudo=c.note.pseudoEachOffsetMs??0,
      from=held?Math.max(c.ms,a.start,bounds?timeline.audioMsFromScoreBeat(bounds[0],chart.firstMs)+pseudo:-Infinity):c.ms,
      to=held?Math.min(c.end,a.end,bounds?timeline.audioMsFromScoreBeat(bounds[1],chart.firstMs)+pseudo:Infinity):c.ms;
    // EPS is only a floating-point identity tolerance, never a rhythm window.
    if(!affinity||from>=a.end-EPS||(held?to<=from+EPS:from<=a.start+EPS)
      ||(!held&&bounds&&(c.beat<bounds[0]||c.beat>bounds[1])))return null;
    const overlap=held?to-from:0,samples=held?policy.pairSamples:1,
      distance=mean(Array.from({length:samples},(_,i)=>norm(sub(pose(a,from+overlap*(i+.5)/samples),c.point))))/diameter,
      remainingMs=Math.max(0,a.end-(from+to)/2),
      raw=3*affinity*distance*(1+Math.log1p(remainingMs/1000))*(1+Math.log1p(overlap/1000));
    if(raw<=EPS)return null;
    return {noteId:c.note.id,atBeat:held?beat(from-pseudo):c.beat,endBeat:held?beat(to-pseudo):c.beat,raw};
  };
  const returnsIn=(a:Action,bounds?:[number,number])=>!bounds?a.headReturns:a.headReturns
    .filter(e=>e.endBeat>=bounds[0]&&e.atBeat<=bounds[1])
    .flatMap(e=>{const clipped=headReturn(a,a.context.find(c=>c.note.id===e.noteId)!,bounds);return clipped?[clipped]:[];});
  const waitingMetrics=function* (shouldYield: () => boolean, sourceActions:Action[],bounds?:[number,number]):Generator<void, StarWaiting, void>{
    const notes=new Map<number,Contact>(),intervals:[number,number][]=[],irregularities:{value:number;count:number}[]=[];
    for(const a of sourceActions){ if (shouldYield()) yield;
      const from=Math.max(a.head,bounds?timeline.audioMsFromScoreBeat(bounds[0],chart.firstMs):-Infinity),
        to=Math.min(a.start,bounds?timeline.audioMsFromScoreBeat(bounds[1],chart.firstMs):Infinity);
      if(to<=from+EPS)continue;
      intervals.push([from,to]);
      const waiting=a.context.filter(c=>c.ms>=from-EPS&&c.ms<=to+EPS&&(!bounds||c.beat>=bounds[0]-EPS&&c.beat<=bounds[1]+EPS));
      for(const c of waiting){ if (shouldYield()) yield; notes.set(c.note.id,c); }
      if(waiting.length){const pseudo=a.head-timeline.audioMsFromScoreBeat(a.headBeat,chart.firstMs),
        evidence=(yield* rhythmComplexity(shouldYield, [beat(from-pseudo),...waiting.map(c=>c.beat),beat(to-pseudo)]));
        irregularities.push({value:evidence.raw,count:waiting.length});}
    }
    intervals.sort((a,b)=>a[0]-b[0]);let durationMs=0,from=0,to=0,initialized=false;
    for(const [start,end] of intervals){ if (shouldYield()) yield;if(!initialized){from=start;to=end;initialized=true;}
      else if(start>to){durationMs+=Math.max(0,to-from);from=start;to=end;}else to=Math.max(to,end);}
    durationMs+=Math.max(0,to-from);
    const onsetBeats=notes.size?(yield* rhythmComplexity(shouldYield, [...notes.values()].map(c=>c.beat))).onsetBeats:[],onsetCount=onsetBeats.length,
      rate=durationMs>EPS?onsetCount/(durationMs/1000):0,
      irregularity=irregularities.length?irregularities.reduce((s,v)=>s+v.value*v.count,0)/irregularities.reduce((s,v)=>s+v.count,0):0,
      base=Math.log1p(notes.size)*Math.log1p(rate);
    return {noteCount:notes.size,onsetCount,rate,irregularity,raw:base*(1+irregularity),noteIds:[...notes.keys()].sort((a,b)=>a-b),durationMs,onsetBeats};
  };
  for(const a of actions){ if (shouldYield()) yield;
    const own=new Set(a.ids),lo=a.headBeat-policy.contextBeats,hi=a.endBeat+policy.contextBeats,candidates:Contact[]=[];
    for(let j=firstAt(contacts,lo);j<contacts.length&&contacts[j]!.beat<=hi;j++){ if (shouldYield()) yield; if(!own.has(contacts[j]!.note.id))candidates.push(contacts[j]!); }
    for(const hold of holds){ if (shouldYield()) yield; if(hold.beat<lo&&hold.endBeat>=a.headBeat&&!own.has(hold.note.id))candidates.push(hold); }
    a.context=candidates;let coupling=0;
    for(const c of candidates){ if (shouldYield()) yield;
      const within=c.beat>=a.headBeat&&c.beat<=a.endBeat,
        gap=within?0:Math.min(Math.abs(c.beat-a.headBeat),Math.abs(c.beat-a.endBeat))/a.pulseBeat,
        point=c.ms<a.start?buttonPoint(a.headPosition):pose(a,Math.min(a.end,c.ms)),
        proximity=Math.exp(-3*norm(sub(point,c.point))/diameter),
        holdOverlap=c.note.type==='hold-start'||c.note.type==='touch-hold-start'?
          Math.max(0,Math.min(c.end,a.end)-Math.max(c.ms,a.head))/Math.max(EPS,a.end-a.head):0,
        boundaryPlanning=c.ms>=a.end?norm(sub(pose(a,a.end),c.point))/diameter:
          c.ms<a.head?norm(sub(buttonPoint(a.headPosition),c.point))/diameter:0;
      const boundary=c.ms<a.head||c.ms>=a.end,
        boundaryGap=boundary?Math.min(Math.abs(c.ms-a.head),Math.abs(c.ms-a.end))/Math.max(EPS,a.end-a.start):0,
        pressure=boundary?1+.8/(1+boundaryGap):1;
      const value=(.18+.7*proximity+.55*holdOverlap+.65*boundaryPlanning)*pressure/(1+gap*gap);
      coupling+=value;a.contextCouplings.set(c.note.id,value);
      const returned=headReturn(a,c);if(returned)a.headReturns.push(returned);
    }
    a.waiting=(yield* waitingMetrics(shouldYield, [a]));const waitingBase=Math.log1p(a.waiting.noteCount)*Math.log1p(a.waiting.rate);
    a.waitingRhythm=.5*waitingBase*a.waiting.irregularity;
    a.parts.context=Math.log1p(coupling)+.5*waitingBase+tracking(a)+a.headReturns.reduce((s,e)=>s+e.raw,0);a.parts.rhythm+=a.waitingRhythm;
  }
  const combine=function* (shouldYield: () => boolean, items:{a:Action;weight:number}[],bounds?:[number,number]){const parts=zero(),mass=items.reduce((s,v)=>s+v.weight,0);
    for(const {a,weight} of items){ if (shouldYield()) yield;const waiting=bounds?(yield* waitingMetrics(shouldYield, [a],bounds)):a.waiting,
      base=Math.log1p(waiting.noteCount)*Math.log1p(waiting.rate);
      for(const k of Object.keys(parts) as (keyof StarComponents)[]){ if (shouldYield()) yield;
        const value=k==='context'&&bounds?Math.log1p(a.context.reduce((s,c)=>s+(c.endBeat>=bounds[0]&&c.beat<=bounds[1]?a.contextCouplings.get(c.note.id)??0:0),0))+.5*base+tracking(a,bounds)+returnsIn(a,bounds).reduce((s,e)=>s+e.raw,0):
          k==='rhythm'&&bounds?a.parts.rhythm-a.waitingRhythm+.5*base*waiting.irregularity:a.parts[k];
        parts[k]+=value*weight;
      }
    }
    for(const k of Object.keys(parts) as (keyof StarComponents)[]){ if (shouldYield()) yield; parts[k]/=Math.sqrt(Math.max(EPS,mass)); }return parts;};
  const actionWindows=function* (shouldYield: () => boolean, width:number){const mapped=new Map<number,{a:Action;weight:number}[]>();
  for(const a of actions){ if (shouldYield()) yield;const from=Math.max(0,Math.floor((a.headBeat-width)/policy.stepBeats)+1),
    until=Math.floor(a.endBeat/policy.stepBeats);
    for(let index=from;index<=until;index++){ if (shouldYield()) yield;
      const start=index*policy.stepBeats,end=start+width,
        overlap=Math.max(0,Math.min(end,a.endBeat)-Math.max(start,a.headBeat));
      if(overlap<=EPS)continue;
      const values=mapped.get(start)??[];values.push({a,weight:overlap/Math.max(EPS,a.endBeat-a.headBeat)});mapped.set(start,values);
    }
  }return mapped;};
  const blocks=(yield* actionWindows(shouldYield, policy.stepBeats));let previous=0,burstRaw=0;
  for(let startBeat=0;startBeat<=Math.max(...blocks.keys());startBeat+=policy.stepBeats){ if (shouldYield()) yield;
    const endBeat=startBeat+policy.stepBeats,items=blocks.get(startBeat)??[],parts=items.length?(yield* combine(shouldYield, items,[startBeat-policy.contextBeats,endBeat+policy.contextBeats])):zero(),raw=total(parts);
    burstRaw=Math.max(burstRaw,Math.max(0,raw-previous));
    previous=raw;
  }
  const components=(yield* combine(shouldYield, actions.map(a=>({a,weight:1})))),raw=total(components),techniqueRaw=technique(components);
  return {raw,techniqueRaw,burstRaw,coverage};
}
