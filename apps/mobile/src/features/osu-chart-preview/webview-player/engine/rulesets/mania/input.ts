/*
 * Source: https://github.com/daladal/replayviewer-js
 * Adapted for fixed-speed chart preview.
 *
 * MIT License
 * 
 * Copyright (c) 2026 bog
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
import type { ReplayData } from '../../types/index';

/** A single key edge decoded from the replay: a press or release of one column at `time` ms. */
export interface ManiaInputEvent {
  time: number;
  column: number;
  kind: 'press' | 'release';
}

/**
 * Decode each .osr frame's MouseX as a column bitmask:
 * LSB = column 0, bit i = column i. Only bits 0..totalColumns-1 are honoured —
 * stable's first replay frame encodes its cursor-X marker (`256` = bit 8) in
 * MouseX, which would otherwise leak as a spurious column-8 press. ppy/osu's
 * LegacyReplayDecoder applies the same `i < TotalColumns` clip.
 *
 * cumTime accumulates negative deltas (lazer encodes audio lead-in as a
 * negative first delta; dropping it shifts the whole timeline forward past
 * every hit window). Output events are emitted in frame order; once spurious
 * bits are masked off, the event stream is monotonic in time.
 */
export function maniaFrames(replay: ReplayData, totalColumns: number): ManiaInputEvent[] {
  const events: ManiaInputEvent[] = [];
  if (totalColumns <= 0) return events;
  const columnMask = totalColumns >= 32 ? -1 >>> 0 : (1 << totalColumns) - 1;
  let cumTime = 0;
  let prevMask = 0;
  for (const frame of replay.frames) {
    cumTime += frame.timeDelta;
    const curMask = (frame.x | 0) & columnMask;
    const presses  = curMask & ~prevMask;
    const releases = ~curMask & prevMask;
    if (presses !== 0 || releases !== 0) {
      for (let col = 0; col < totalColumns; col++) {
        const bit = 1 << col;
        if (presses  & bit) events.push({ time: cumTime, column: col, kind: 'press'   });
        if (releases & bit) events.push({ time: cumTime, column: col, kind: 'release' });
      }
    }
    prevMask = curMask;
  }
  return events;
}
