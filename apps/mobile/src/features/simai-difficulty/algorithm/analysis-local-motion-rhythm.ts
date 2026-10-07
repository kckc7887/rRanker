/** DXTag cbea1ff20d69c3eaa163c7d967b708bd076e5d96 (MIT), Copyright (c) 2026 尘言.
 * https://github.com/kckc7887/DXTag — see THIRD_PARTY_NOTICES.md.
 */
/** Local Slide configuration rhythm, separate from physical intensity.
 * Uses parsed events only. A remote keyboard passage cannot change a Slide's
 * handling group, and no official constant, level, or chart category is read.
 */
import type { SlideEvent } from './types';

export const LOCAL_MOTION_RHYTHM_SCHEMA = 'local-motion-rhythm-v1';
const EPSILON_MS = 1e-6;
// A dimensionless context bound, not a judgement window or fatigue threshold.
// It admits a 135ms zero-wait path repeated every 500ms, while rejecting a
// distant isolated Slide. Physical burst/stamina gates remain the caller's job.
const NEIGHBOR_DURATION_RATIO = 4;
const LATTICE_TOLERANCE = .025;

export type LocalRhythmOnset = {
  slideId: number; branchIndex: number; kind: 'launch' | 'head'; timeMs: number; beat: number;
};
export type LocalRhythmInterval = {
  from: LocalRhythmOnset; to: LocalRhythmOnset; gapMs: number; gapBeats: number;
};
export type LocalMotionRhythm = {
  slideId: number; branchIndex: number; pulseMs: number;
  source: 'declared-wait' | 'nearby-launches' | 'nearby-heads' | 'motion-duration';
  evidence: {
    schemaVersion: typeof LOCAL_MOTION_RHYTHM_SCHEMA;
    headMs: number; headBeat: number; launchMs: number; launchBeat: number;
    waitMs: number; declaredWaitBeats: number; actualWaitBeatSpan: number;
    motionMs: number; motionBeatSpan: number; neighborDurationRatio: number;
    onsets: LocalRhythmOnset[]; intervals: LocalRhythmInterval[]; inferredDivisor: number;
    limitation: string;
  };
};

export const motionRhythmKey = (slideId: number, branchIndex: number) => `${slideId}:${branchIndex}`;

/** Infer a local lattice from actual adjacent onset gaps. Score-beat endpoint
 * evidence is retained separately: one millisecond pulse has no single global
 * beat span when a BPM transition crosses this configuration.
 */
function intervalPulse(intervals: readonly LocalRhythmInterval[]): { pulseMs: number; divisor: number } {
  const gaps = intervals.map(interval => interval.gapMs).filter(gap => gap > EPSILON_MS);
  const shortest = Math.min(...gaps);
  for (const divisor of [1, 2, 3, 4]) {
    const pulseMs = shortest / divisor;
    if (gaps.every(gap => Math.abs(gap / pulseMs - Math.round(gap / pulseMs)) <= LATTICE_TOLERANCE)) {
      return { pulseMs, divisor };
    }
  }
  return { pulseMs: shortest, divisor: 1 };
}

function localOnsets(event: SlideEvent, events: readonly SlideEvent[], kind: 'launch' | 'head'): LocalRhythmOnset[] {
  const radius = Math.max(EPSILON_MS, event.endMs - event.startMs) * NEIGHBOR_DURATION_RATIO;
  const current: LocalRhythmOnset = { slideId: event.slideId, branchIndex: event.branchIndex,
    kind: 'launch', timeMs: event.startMs, beat: event.startBeat };
  const candidates = events.filter(other => other.slideId !== event.slideId && (kind !== 'head' || !other.headless))
    .map(other => ({ slideId: other.slideId, branchIndex: other.branchIndex, kind,
      timeMs: kind === 'launch' ? other.startMs : other.headMs, beat: kind === 'launch' ? other.startBeat : other.headBeat }))
    .filter(onset => Math.abs(onset.timeMs - current.timeMs) <= radius + EPSILON_MS);
  // Multiple paths launched by the same head do not create additional rhythmic
  // attacks. Keep one closest reference per independent Slide identity.
  const independent = new Map<number, LocalRhythmOnset>();
  for (const onset of candidates) {
    const prior = independent.get(onset.slideId);
    if (!prior || Math.abs(onset.timeMs - current.timeMs) < Math.abs(prior.timeMs - current.timeMs)) independent.set(onset.slideId, onset);
  }
  const ordered = [current, ...independent.values()].sort((a,b)=>a.timeMs-b.timeMs ||
    Number(b===current)-Number(a===current) || a.slideId-b.slideId || a.branchIndex-b.branchIndex);
  const unique: LocalRhythmOnset[] = [];
  for (const onset of ordered) if (!unique.length || onset.timeMs - unique.at(-1)!.timeMs > EPSILON_MS) unique.push(onset);
  return unique;
}

export function localMotionRhythm(events: readonly SlideEvent[]): Map<string, LocalMotionRhythm> {
  const result = new Map<string, LocalMotionRhythm>();
  for (const event of events) {
    const evidence: LocalMotionRhythm['evidence'] = {
      schemaVersion: LOCAL_MOTION_RHYTHM_SCHEMA,
      headMs:event.headMs,headBeat:event.headBeat,launchMs:event.startMs,launchBeat:event.startBeat,
      waitMs:event.waitMs,declaredWaitBeats:event.declaredWaitBeats,actualWaitBeatSpan:event.startBeat-event.headBeat,
      motionMs:Math.max(0,event.endMs-event.startMs),motionBeatSpan:event.endBeat-event.startBeat,
      neighborDurationRatio:NEIGHBOR_DURATION_RATIO,onsets:[],intervals:[],inferredDivisor:1,
      limitation:'Local rhythm context only; no optimal hand assignment, judgement window, burst intensity or stamina truth is inferred.',
    };
    let pulseMs: number, source: LocalMotionRhythm['source'];
    if (event.waitMs > 0) {
      // Explicit seconds/BPM and default one-beat declarations are already
      // resolved by the parser; never enlarge them using a song-wide pulse.
      pulseMs=event.waitMs;source='declared-wait';
    } else {
      let onsets=localOnsets(event,events,'launch');
      source='nearby-launches';
      if(onsets.length<2){onsets=localOnsets(event,events,'head');source='nearby-heads';}
      if(onsets.length>=2){
        evidence.onsets=onsets;
        evidence.intervals=onsets.slice(1).map((to,index)=>({from:onsets[index]!,to,gapMs:to.timeMs-onsets[index]!.timeMs,gapBeats:to.beat-onsets[index]!.beat}));
        const inferred=intervalPulse(evidence.intervals);pulseMs=inferred.pulseMs;evidence.inferredDivisor=inferred.divisor;
      }else{
        pulseMs=Math.max(EPSILON_MS,event.endMs-event.startMs);source='motion-duration';
        evidence.onsets=onsets;
      }
    }
    result.set(motionRhythmKey(event.slideId,event.branchIndex),{slideId:event.slideId,branchIndex:event.branchIndex,pulseMs,source,evidence});
  }
  return result;
}
