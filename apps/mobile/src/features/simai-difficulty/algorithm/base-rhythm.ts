/** DXTag cbea1ff20d69c3eaa163c7d967b708bd076e5d96 (MIT), Copyright (c) 2026 尘言.
 * https://github.com/kckc7887/DXTag — see THIRD_PARTY_NOTICES.md.
 */
import type {Note} from '../simai/types';
const q = (a: number[], p: number) => a.length ? [...a].sort((x, y) => x - y)[Math.floor((a.length - 1) * p)]! : 0;
/** Infer a local notation-independent subdivision from actual onset spacing.
 * Pseudo-EACH offsets are annotations, not a new rhythmic subdivision. */
export function inferRhythmUnit(notes: readonly Note[]): number {
  const times = [...new Set(notes.filter(n => !n.isMine).map(n => n.timingMs - (n.pseudoEachOffsetMs ?? 0)))].sort((a,b)=>a-b);
  const gaps = times.slice(1).map((time,i)=>time-times[i]!).filter(gap=>gap>1e-6);
  if (!gaps.length) return 1;
  const short = q(gaps, .15);
  // Ratios reveal a hidden subdivision in 3:1 or 3:2 patterns without using displayed BPM.
  const candidates = gaps.filter(gap => gap <= short * 4);
  const divisions = [1, 2, 3, 4];
  let best = short;
  for (const divisor of divisions) {
    const unit = short / divisor;
    const score = candidates.filter(gap => Math.abs(gap/unit - Math.round(gap/unit)) < .025).length / Math.max(1,candidates.length);
    if (score >= .92) { best = unit; break; }
  }
  return Math.max(1e-6, best);
}
export const relativeRhythmNear = (value: number, target: number, tolerance = .025) =>
  Math.abs(value-target) <= Math.max(1e-6, Math.abs(target)*tolerance);

/** Real fully idle gaps between occupied union components. A short nested
 * operation ending does not free the player while an earlier long one remains.
 * Leading/trailing silence and zero-length overlap gaps are not samples. */
export function recoveryGaps(ranges: readonly {start:number;end:number}[]): number[] {
  const ordered=ranges.filter(range=>range.end>range.start).sort((a,b)=>a.start-b.start);
  const gaps:number[]=[];let occupiedUntil=Number.NEGATIVE_INFINITY;
  for(const range of ordered){
    if(Number.isFinite(occupiedUntil)&&range.start>occupiedUntil+1e-6)gaps.push(range.start-occupiedUntil);
    occupiedUntil=Math.max(occupiedUntil,range.end);
  }
  return gaps;
}
