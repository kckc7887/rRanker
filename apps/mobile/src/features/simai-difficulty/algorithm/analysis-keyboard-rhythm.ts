/** DXTag cbea1ff20d69c3eaa163c7d967b708bd076e5d96 (MIT), Copyright (c) 2026 尘言.
 * https://github.com/kckc7887/DXTag — see THIRD_PARTY_NOTICES.md.
 */
import type { Note } from '../simai/types';

/** Musical long/short relations use score-beat gaps. Ternary/binary ratios
 * (3:1, 3:2 and 3:4) capture dotted rhythms mixed with straight beats without
 * assuming the whole song's shortest interval is a sixteenth note. They are
 * rhythm contrasts, not proof of a literal dotted glyph: a triplet ending can
 * also make 3:1. Public technique still needs local movement / repetition.
 * Every ratio is invariant under tempo and equivalent notation scaling. */
export function dottedBeatGapFlags(gaps: readonly number[]): boolean[] {
  return gaps.map((gap, i) => gap > 1e-6 && [gaps[i - 1], gaps[i + 1]].some(other =>
    other !== undefined && other > 1e-6 && [3, 1.5, .75].some(ratio =>
      Math.abs(gap / other - ratio) <= ratio * .025)));
}

/** The repeated-position relation is structural; the separate per-attack rate
 * determines whether this particular run is physically rapid. Every source
 * note and every transition participates, including the middle of the run. */
export function isRapidSameKeyRun(notes: readonly Note[], minimumRate = 3): boolean {
  if (notes.length < 4 || typeof notes[0]!.position !== 'number') return false;
  return notes.every(note => note.position === notes[0]!.position) && notes.slice(1).every((note, i) => {
    const gap = note.timingMs - notes[i]!.timingMs;
    return gap > 1e-6 && 1000 / gap >= minimumRate - 1e-6;
  });
}
