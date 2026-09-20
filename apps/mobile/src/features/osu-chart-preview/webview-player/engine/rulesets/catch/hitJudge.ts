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
import type { HitResult } from '../../types/index';
import type { CatchObject } from './types';
import type { CatcherFrame } from './input';
import { calculateCatchWidth } from './converter';
import { sampleCatcherX } from './input';

// The catch overlap test at one instant, float32 throughout (matches lazer's float Catcher.CanCatch).
function caughtAtTime(path: readonly CatcherFrame[], time: number, effX: number, half: number): boolean {
  const cx = Math.fround(sampleCatcherX(path, time));
  return effX >= Math.fround(cx - half) && effX <= Math.fround(cx + half);
}

/**
 * Positional hit judgement — catch has NO hit windows. For each palpable object
 * (fruit/droplet/tinyDroplet/banana; the JuiceStream/BananaShower containers were already
 * flattened away in conversion), sample the interpolated+clamped catcher X at the object's
 * StartTime and run the 1-D overlap test (Catcher.CanCatch):
 *
 *     caught  ⇔  |effectiveX − catcherX| ≤ catchWidth/2
 *
 * Both X values live in the unscaled 0..512 osu-px domain (effectiveX clamped by the
 * position pass, catcherX clamped after interpolation by sampleCatcherX), so the test is
 * purely 1-D.
 *
 * Emits exactly one HitResult per object (in start-time order), tagged with `catchType`
 * for the score/acc/combo timelines:
 *  - Fruit       → 300, comboBreak on miss   (Great;      affects combo + accuracy)
 *  - Droplet     → 100, comboBreak on miss   (LargeTick;  affects combo + accuracy)
 *  - TinyDroplet → 50,  comboIgnore          (SmallTick;  accuracy only, combo-neutral)
 *  - Banana      → bonus, comboIgnore        (LargeBonus; neither combo nor accuracy)
 * A miss is judgement 0. comboIgnore results never break combo, so tiny-droplet and banana
 * misses never count as a miss/sliderbreak (e.g. on the scrub bar). objectIndex is the source
 * .osu index; x is effectiveX (y unused — catch is 1-D).
 */
export function computeCatchHitResults(
  objects: readonly CatchObject[],
  catcherPath: readonly CatcherFrame[],
  cs: number,
): HitResult[] {
  // lazer's CanCatch is float32 throughout (Catcher.X, CatchWidth, EffectiveX are all float).
  // Doing the test in float64 flips fruit caught at the very edge of the plate (HR pushes more
  // fruit to edges, so it shows there). fround the width, the sampled catcher X, and the band
  // bounds to match `halfCatchWidth = CatchWidth * 0.5f; effX >= X - half && effX <= X + half`.
  const half = Math.fround(calculateCatchWidth(cs) * 0.5);
  // Judge in play order (StartTime); stable sort keeps generation order for equal times.
  const ordered = [...objects].sort((a, b) => a.startTime - b.startTime);

  const results: HitResult[] = [];
  for (const obj of ordered) {
    // The overlap test (float32), sampled at the object's StartTime — the same interpolated
    // catcher X lazer's CanCatch reads. Deliberately NO backward lookback/rescue window:
    // per-object comparison against a headless osu! lazer re-simulation showed a backward
    // window only ever turns genuine misses into false catches (the catcher sweeps through
    // the plate then exits before StartTime), inflating counts on both stable and lazer
    // replays; exact-at-StartTime matches lazer per object. The only residual is a handful of
    // sub-frame borderlines (lazer's frame-stable clock samples at StartTime + ε; we sample
    // at StartTime) — irreducible.
    const caught = caughtAtTime(catcherPath, obj.startTime, obj.effectiveX, half);

    const base = {
      objectIndex: obj.sourceIndex,
      time: obj.startTime,
      x: obj.effectiveX,
      y: 0,
      hitSound: obj.hitSound,
      catchType: obj.type,
    };

    switch (obj.type) {
      case 'fruit':
        results.push({ ...base, judgement: caught ? 300 : 0, comboBreak: !caught });
        break;
      case 'droplet':
        results.push({ ...base, judgement: caught ? 100 : 0, comboBreak: !caught });
        break;
      case 'tinyDroplet':
        results.push({ ...base, judgement: caught ? 50 : 0, comboBreak: false, comboIgnore: true });
        break;
      case 'banana':
        // LargeBonus: a caught banana awards bonus score; an uncaught banana is a
        // pure no-op. Combo- and accuracy-neutral either way. The 300 is just a "caught"
        // sentinel (no 300-bucket meaning) — the score processor reads catchType, not the value.
        results.push({ ...base, judgement: caught ? 300 : 0, comboBreak: false, comboIgnore: true });
        break;
    }
  }
  return results;
}

/**
 * Console diagnostic: for every MISSED fruit/droplet (the combo-breaking misses), recompute
 * the exact catch test and report how far the object sat outside the plate. On a play the
 * .osr reports as an FC, every row is a FALSE miss:
 *   • overBy ~1-5px  → near-edge / stable frame-quantization floor (irreducible-ish).
 *   • overBy large   → the object's EffectiveX or the decoded catcher path is wrong for it.
 *   • hyper=true cluster → hyperdash handling.
 * Logs a collapsed group; no-op when there are no misses.
 */
export function logCatchMissReport(
  objects: readonly CatchObject[],
  catcherPath: readonly CatcherFrame[],
  cs: number,
): void {
  const half = Math.fround(calculateCatchWidth(cs) * 0.5);
  const W = 150;                              // wide ± ms probe to characterise the trajectory
  const r1 = (x: number): number => Math.round(x * 10) / 10;
  const rows: {
    time: number; type: string; effX: number; catcherX0: number;
    overBy: number; bestAtMs: number; minOver: number;
    enterMs: number | null; exitMs: number | null; hyper: boolean;
  }[] = [];
  const trajectories: { time: number; cols: Record<string, number> }[] = [];
  for (const obj of objects) {
    if (obj.type !== 'fruit' && obj.type !== 'droplet') continue;   // combo-affecting only
    const catcherX0 = Math.fround(sampleCatcherX(catcherPath, obj.startTime));
    const lo = Math.fround(catcherX0 - half);
    const hi = Math.fround(catcherX0 + half);
    if (obj.effectiveX >= lo && obj.effectiveX <= hi) continue;     // caught — skip

    // Closest approach over a wide window + when the catcher path is INSIDE the plate
    // (enter/exit, ms relative to StartTime). This shows whether the catcher swept through
    // briefly (timing floor) or sat on the fruit long before StartTime then left (clock/time bug).
    let minDist = Infinity, bestDt = 0;
    let enterMs: number | null = null, exitMs: number | null = null;
    for (let dt = -W; dt <= W; dt++) {
      const d = Math.abs(obj.effectiveX - sampleCatcherX(catcherPath, obj.startTime + dt));
      if (d < minDist) { minDist = d; bestDt = dt; }
      const inside = d <= half;
      if (inside && enterMs === null) enterMs = dt;
      if (inside) exitMs = dt;
    }
    rows.push({
      time: Math.round(obj.startTime),
      type: obj.type,
      effX: r1(obj.effectiveX),
      catcherX0: r1(catcherX0),
      overBy: r1(Math.abs(obj.effectiveX - catcherX0) - half),
      bestAtMs: bestDt,
      minOver: r1(minDist - half),
      enterMs, exitMs,
      hyper: obj.hyperDash,
    });
    // Catcher X sampled across the window, so the raw sweep is visible.
    const cols: Record<string, number> = { effX: r1(obj.effectiveX) };
    for (const dt of [-120, -90, -60, -30, -15, 0, 15, 30]) cols[`${dt}ms`] = r1(sampleCatcherX(catcherPath, obj.startTime + dt));
    trajectories.push({ time: Math.round(obj.startTime), cols });
  }
  if (rows.length === 0) return;
  rows.sort((a, b) => a.overBy - b.overBy);
  console.groupCollapsed(`[catch misses] ${rows.length} fruit/droplet missed — enter/exitMs = window (ms vs StartTime) the catcher was INSIDE the plate`);
  console.table(rows.slice(0, 50));
  console.log('catcher X trajectory around each miss (cols = ms offset from StartTime):');
  for (const t of trajectories.slice(0, 20)) console.log(`  t=${t.time}`, t.cols);
  console.groupEnd();
}
