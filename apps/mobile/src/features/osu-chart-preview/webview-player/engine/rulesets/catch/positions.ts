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
import type { BeatmapData } from '../../types/index';
import type { ModDifficulty } from '../../utils/modDifficulty';
import type { CatchObject } from './types';
import { LegacyRandom } from './random';
import { calculateCatchWidth } from './converter';

/**
 * Position generation. Ports `CatchBeatmapProcessor.ApplyPositionOffsets` +
 * `applyHardRockOffset` + `initialiseHyperDash` from ppy/osu master. Reproduces the byte-exact
 * `EffectiveX` array (every catch judgement reads it) and the hyperdash (red-fruit) flags.
 *
 * A SINGLE `LegacyRandom(1337)` is shared across the whole beatmap; the number and order of
 * draws — including the throwaway `next()` calls (banana type/rotation/colour, droplet
 * rotation) — are load-bearing. Iteration is over TOP-LEVEL objects in beatmap order; within a
 * JuiceStream we walk nested objects in construction (generation) order, NOT start-time order
 * — our flat list is already in that order, contiguous per source object.
 *
 * Cast discipline: `Math.fround` the float-typed values (xOffset, effectiveX,
 * positionDiff, distanceToHyper, scale/width), `Math.trunc` the `(int)` casts (time deltas,
 * RNG int overloads), everything else double.
 */

const WIDTH = 512; // CatchPlayfield.WIDTH
const RNG_SEED = 1337; // CatchBeatmapProcessor.RNG_SEED
const ALLOWED_CATCH_RANGE = 0.8; // Catcher.ALLOWED_CATCH_RANGE
const BASE_DASH_SPEED = 1.0; // Catcher.BASE_DASH_SPEED (px/ms)

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Run the full position pass over the flat palpable list produced by `convertBeatmapToCatch`
 * (mutates `xOffset`, `effectiveX`, `hyperDash`, `distanceToHyperDash`, `hyperDashTargetX`
 * in place; all X values are osu-px on the 0..512 playfield). Ports lazer's
 * `CatchBeatmapProcessor` byte-exactly, including its shared `LegacyRandom(1337)` draw
 * order. Must run AFTER conversion and BEFORE judgement, with `objects` still in generation
 * order. `beatmap` is needed to dispatch on each source object's top-level type and to read
 * a slider's final control point (the JuiceStream `lastPosition` HardRock seed); `modDiff`
 * supplies the HR/Mirror flags and the circle size for the hyperdash pass.
 */
export function applyPositionOffsets(objects: CatchObject[], beatmap: BeatmapData, modDiff: ModDifficulty): void {
  const rng = new LegacyRandom(RNG_SEED);
  const hardRock = modDiff.isHR;

  let lastPosition: number | null = null;
  let lastStartTime = 0;

  // Walk top-level groups (contiguous by sourceIndex; generation order == beatmap order).
  let i = 0;
  while (i < objects.length) {
    const src = objects[i]!.sourceIndex;
    let j = i;
    while (j < objects.length && objects[j]!.sourceIndex === src) j++;
    const top = beatmap.hitObjects[src];

    if (top?.type === 'circle') {
      // Standalone Fruit (one object). XOffset stays 0 unless HardRock (which is the only
      // path that consumes fruit RNG); non-HR fruit consumes zero draws.
      const fruit = objects[i]!;
      fruit.xOffset = 0;
      if (hardRock) {
        const r = applyHardRockOffset(fruit, lastPosition, lastStartTime, rng);
        lastPosition = r.lastPosition;
        lastStartTime = r.lastStartTime;
      }
    } else if (top?.type === 'spinner') {
      // BananaShower: 4 draws per banana — NextDouble for X, then 3 discarded
      // (stable's type / rotation / colour). Bananas don't touch lastPosition.
      for (let k = i; k < j; k++) {
        const banana = objects[k]!;
        banana.xOffset = Math.fround(rng.nextDouble() * WIDTH);
        rng.next();
        rng.next();
        rng.next();
      }
    } else if (top?.type === 'slider') {
      // JuiceStream. The two stable BUG!! values (preserved on purpose): lastPosition uses the
      // last CONTROL POINT, not the computed path end; lastStartTime is the (early-referenced)
      // start time, not the end time. ControlPoints[^1] is head-relative in lazer; our
      // curvePoints are absolute, so OriginalX + relativeLastCP == the absolute last curvePoint.
      const cps = top.curvePoints;
      lastPosition = Math.fround(cps[cps.length - 1]!.x);
      lastStartTime = top.time;

      for (let k = i; k < j; k++) {
        const nested = objects[k]!;
        nested.xOffset = 0;
        if (nested.type === 'tinyDroplet') {
          // ±20px integer jitter, clamped so OriginalX + XOffset stays in [0, 512]. One draw.
          nested.xOffset = Math.fround(
            clamp(rng.nextIntRange(-20, 20), -nested.originalX, WIDTH - nested.originalX),
          );
        } else if (nested.type === 'droplet') {
          rng.next(); // discarded: stable's droplet rotation
        }
        // nested fruit (head/repeat/tail): no RNG, xOffset stays 0
      }
    }

    i = j;
  }

  // EffectiveX = clamp(OriginalX + XOffset, 0, 512) — lazer applies the clamp lazily in the
  // CatchHitObject getter. Compute for every object now that all offsets are final.
  for (const obj of objects) {
    obj.effectiveX = Math.fround(clamp(obj.originalX + obj.xOffset, 0, WIDTH));
  }

  initialiseHyperDash(objects, modDiff.cs);

  // Mirror — CatchModMirror is IApplicableToBeatmap, so it runs AFTER the processor
  // (offsets + hyperdash). It reflects every object's X about the playfield centre
  // (OriginalX → WIDTH − OriginalX, XOffset → −XOffset, banana XOffset → WIDTH − XOffset,
  // juice-stream path X negated) — all of which reduce to EffectiveX → WIDTH − EffectiveX for
  // the in-range gameplay value judgement reads. Hyperdash is mirror-symmetric (distances
  // preserved, directions flip in lockstep), so lazer does NOT recompute it after the flip; we
  // just reflect the stored target X too. The replay catcher X is already in post-mod (mirrored)
  // space, so reflecting the objects lets judgement compare directly.
  if (modDiff.isMirror) {
    for (const obj of objects) {
      obj.effectiveX = Math.fround(WIDTH - obj.effectiveX);
      if (obj.hyperDashTargetX !== undefined) {
        obj.hyperDashTargetX = Math.fround(WIDTH - obj.hyperDashTargetX);
      }
    }
  }
}

/**
 * `applyHardRockOffset` — HR-only fruit X jitter, applied per top-level Fruit. Returns
 * the carried `lastPosition`/`lastStartTime` (the `positionDiff === 0` random branch returns
 * the OLD pair — it `return`s before the trailing update; reproduce exactly).
 */
function applyHardRockOffset(
  obj: CatchObject,
  lastPosition: number | null,
  lastStartTime: number,
  rng: LegacyRandom,
): { lastPosition: number | null; lastStartTime: number } {
  let offsetPosition = obj.originalX; // float
  const startTime = obj.startTime;

  // First fruit, or a previous fruit landed at x=0 (preserved stable quirk): record, no offset.
  if (lastPosition === null || lastPosition === 0) {
    return { lastPosition: offsetPosition, lastStartTime: startTime };
  }

  const positionDiff = Math.fround(offsetPosition - lastPosition); // float subtraction
  const timeDiff = Math.trunc(startTime - lastStartTime); // (int) time delta (stable BUG!!)

  if (timeDiff > 1000) {
    return { lastPosition: offsetPosition, lastStartTime: startTime };
  }

  if (positionDiff === 0) {
    // Stacked notes → random jitter. maxOffset = timeDiff/4d (double division). This branch
    // sets XOffset but does NOT update lastPosition/lastStartTime.
    offsetPosition = applyRandomOffset(offsetPosition, timeDiff / 4, rng);
    obj.xOffset = Math.fround(offsetPosition - obj.originalX);
    return { lastPosition, lastStartTime };
  }

  if (Math.abs(positionDiff) < Math.trunc(timeDiff / 3)) {
    // timeDiff/3 is INT division (the ReSharper PossibleLossOfFraction comment); keep it.
    offsetPosition = applyOffset(offsetPosition, positionDiff);
  }

  obj.xOffset = Math.fround(offsetPosition - obj.originalX);
  return { lastPosition: offsetPosition, lastStartTime: startTime };
}

// HR random jitter: NextBool direction + an int rand in [0, maxOffset) capped at 20px, then
// reflected off the nearer edge (non-strict bounds <= 512 / >= 0).
function applyRandomOffset(position: number, maxOffset: number, rng: LegacyRandom): number {
  const right = rng.nextBool();
  const rand = Math.min(20, Math.fround(rng.nextDoubleRange(0, Math.max(0, maxOffset))));
  if (right) {
    if (position + rand <= WIDTH) position += rand;
    else position -= rand;
  } else {
    if (position - rand >= 0) position -= rand;
    else position += rand;
  }
  return Math.fround(position);
}

// HR deterministic mirror push by `amount`, dropped entirely if it would breach an edge
// (strict < 512 / > 0 — note: NOT reflected, unlike applyRandomOffset).
function applyOffset(position: number, amount: number): number {
  if (amount > 0) {
    if (position + amount < WIDTH) position += amount;
  } else {
    if (position + amount > 0) position += amount;
  }
  return Math.fround(position);
}

/**
 * `initialiseHyperDash`. Walks the GLOBALLY start-time-sorted palpable subset (Fruit OR
 * non-tiny Droplet — bananas and tiny droplets never participate), marking a fruit "hyper"
 * (red) when the next object is unreachable at BASE_DASH_SPEED. Reads `effectiveX`, so it must
 * run after all offsetting. The full catcher width (margins divided back out) is the deliberate
 * stable-parity bug.
 */
function initialiseHyperDash(objects: CatchObject[], cs: number): void {
  const palpable = objects
    .filter((o) => o.type === 'fruit' || o.type === 'droplet')
    .sort((a, b) => a.startTime - b.startTime); // stable sort (ES2019+)

  let halfCatcherWidth = calculateCatchWidth(cs) / 2;
  halfCatcherWidth /= ALLOWED_CATCH_RANGE; // /= 0.8 — full catcher size, margins excluded

  let lastDirection = 0;
  let lastExcess = halfCatcherWidth;

  for (let i = 0; i < palpable.length - 1; i++) {
    const cur = palpable[i]!;
    const nxt = palpable[i + 1]!;

    cur.hyperDash = false;
    cur.hyperDashTargetX = undefined;
    cur.distanceToHyperDash = 0;

    const thisDirection = nxt.effectiveX > cur.effectiveX ? 1 : -1;
    // Int-truncated start times (stable parity) minus a ¼-frame grace (1000/60/4 ms).
    const timeToNext = Math.trunc(nxt.startTime) - Math.trunc(cur.startTime) - 1000 / 60 / 4;
    const distanceToNext =
      Math.abs(nxt.effectiveX - cur.effectiveX) - (lastDirection === thisDirection ? lastExcess : halfCatcherWidth);
    const distanceToHyper = Math.fround(timeToNext * BASE_DASH_SPEED - distanceToNext);

    if (distanceToHyper < 0) {
      cur.hyperDash = true;
      cur.hyperDashTargetX = nxt.effectiveX;
      lastExcess = halfCatcherWidth;
    } else {
      cur.distanceToHyperDash = distanceToHyper;
      lastExcess = clamp(distanceToHyper, 0, halfCatcherWidth);
    }

    lastDirection = thisDirection;
  }
}
