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
