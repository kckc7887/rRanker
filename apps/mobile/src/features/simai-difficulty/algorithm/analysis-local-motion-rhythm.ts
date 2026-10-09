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

type LocalRhythmOnset = { slideId:number;branchIndex:number;timeMs:number };
export const motionRhythmKey = (slideId: number, branchIndex: number) => `${slideId}:${branchIndex}`;

function intervalPulse(intervals: readonly {gapMs:number}[]): { pulseMs: number; divisor: number } {
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

function* localOnsets(shouldYield: () => boolean, event: SlideEvent, events: readonly SlideEvent[], kind: 'launch' | 'head'): Generator<void, LocalRhythmOnset[], void> {
  const radius = Math.max(EPSILON_MS, event.endMs - event.startMs) * NEIGHBOR_DURATION_RATIO;
  const current: LocalRhythmOnset = { slideId: event.slideId, branchIndex: event.branchIndex,
    timeMs: event.startMs };
  const candidates = events.filter(other => other.slideId !== event.slideId && (kind !== 'head' || !other.headless))
    .map(other => ({ slideId: other.slideId, branchIndex: other.branchIndex,
      timeMs: kind === 'launch' ? other.startMs : other.headMs }))
    .filter(onset => Math.abs(onset.timeMs - current.timeMs) <= radius + EPSILON_MS);
  // Multiple paths launched by the same head do not create additional rhythmic
  // attacks. Keep one closest reference per independent Slide identity.
  const independent = new Map<number, LocalRhythmOnset>();
  for (const onset of candidates) { if (shouldYield()) yield;
    const prior = independent.get(onset.slideId);
    if (!prior || Math.abs(onset.timeMs - current.timeMs) < Math.abs(prior.timeMs - current.timeMs)) independent.set(onset.slideId, onset);
  }
  const ordered = [current, ...independent.values()].sort((a,b)=>a.timeMs-b.timeMs ||
    Number(b===current)-Number(a===current) || a.slideId-b.slideId || a.branchIndex-b.branchIndex);
  const unique: LocalRhythmOnset[] = [];
  for (const onset of ordered) { if (shouldYield()) yield; if (!unique.length || onset.timeMs - unique.at(-1)!.timeMs > EPSILON_MS) unique.push(onset); }
  return unique;
}

export function* localMotionRhythm(shouldYield: () => boolean, events: readonly SlideEvent[]): Generator<void, Map<string, number>, void> {
  const result = new Map<string, number>();
  for (const event of events) { if (shouldYield()) yield;
    let pulseMs: number;
    if (event.waitMs > 0) {
      pulseMs=event.waitMs;
    } else {
      let onsets=yield* localOnsets(shouldYield, event,events,'launch');
      if(onsets.length<2)onsets=yield* localOnsets(shouldYield, event,events,'head');
      if(onsets.length>=2){
        const intervals=onsets.slice(1).map((to,index)=>({gapMs:to.timeMs-onsets[index]!.timeMs}));
        pulseMs=intervalPulse(intervals).pulseMs;
      }else pulseMs=Math.max(EPSILON_MS,event.endMs-event.startMs);
    }
    result.set(motionRhythmKey(event.slideId,event.branchIndex),pulseMs);
  }
  return result;
}
