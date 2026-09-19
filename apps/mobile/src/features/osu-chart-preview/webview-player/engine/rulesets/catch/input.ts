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

/** One decoded catcher sample: absolute time (ms), raw catcher X, dash flag. */
export interface CatcherFrame {
  /** Absolute time (ms) — cumulative timeDelta, negative lead-in included. */
  readonly time: number;
  /** Catcher osu!px on the CatchPlayfield 0..512 domain, NO scaling — raw legacy
   *  MouseX, left unclamped here (sampleCatcherX clamps after interpolation). */
  readonly x: number;
  /** Dash bit = ReplayButtonState.Left1. Decorative for catch (trail/speed),
   *  never part of the catch test. */
  readonly dash: boolean;
}

const WIDTH = 512;               // CatchPlayfield.WIDTH
const CENTER_X = 256;            // CatchPlayfield.CENTER_X
const DASH_STATE = 1;            // ReplayButtonState.Left1 (bit 0)

/**
 * Decode .osr frames into the catcher path. The catcher X is the raw legacy MouseX on the
 * 0..512 playfield domain with NO scaling; MouseY is unused (catch is 1-D).
 *
 * Cumulative time accumulates every timeDelta including the negative lead-in (lazer encodes
 * audio lead-in as a negative first delta; dropping it would shift the whole timeline
 * forward). ReplayParser already strips the `-12345` RNG-seed sentinel and never applies the
 * osu! M1/M2→K1/K2 remap to catch, so the dash bit (bit 0) is intact.
 *
 * Stable seeds two lead-in placeholder frames at (256, -500); lazer's LegacyScoreDecoder
 * strips them *after* baking in their time delta. We mirror that: accumulate their
 * timeDelta, but emit no path point, so the catcher doesn't ramp from centre at the very
 * start. The -500 Y sentinel is the match (catch's 256 X is a legitimate centre position).
 *
 * Dash uses strict equality `== Left1`: any other/extra bits ⇒ not dashing.
 * (CatchReplayFrame compares the whole ButtonState, not just bit 0; the two agree for real
 * catch frames, which only ever carry bit 0.)
 */
export function catchFrames(replay: ReplayData): CatcherFrame[] {
  const path: CatcherFrame[] = [];
  let cumTime = 0;
  for (let i = 0; i < replay.frames.length; i++) {
    const f = replay.frames[i]!;
    cumTime += f.timeDelta;
    if (i < 2 && f.x === CENTER_X && f.y === -500) continue; // stable lead-in placeholder
    path.push({ time: cumTime, x: f.x, dash: f.keys === DASH_STATE });
  }
  return path;
}

function clampX(x: number): number {
  return x < 0 ? 0 : x > WIDTH ? WIDTH : x;
}

/**
 * Catcher X at `time`: linear interpolation of the raw frame X by time, clamped to [0,512]
 * AFTER interpolation, holding constant outside the frame range (no extrapolation).
 */
export function sampleCatcherX(path: readonly CatcherFrame[], time: number): number {
  const n = path.length;
  if (n === 0) return CENTER_X;
  if (time <= path[0]!.time) return clampX(path[0]!.x);
  const last = path[n - 1]!;
  if (time >= last.time) return clampX(last.x);

  // Binary search for the segment [lo, lo+1] whose time span contains `time`.
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (path[mid]!.time <= time) lo = mid;
    else hi = mid;
  }
  const a = path[lo]!;
  const b = path[lo + 1]!;
  const dt = b.time - a.time;
  const frac = dt <= 0 ? 0 : (time - a.time) / dt;
  return clampX(a.x + (b.x - a.x) * frac);
}
