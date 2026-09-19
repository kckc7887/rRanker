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
import type { AutoFrame } from '../../utils/autoReplay';
import type { TaikoHit } from './types';
import { convertBeatmapToTaiko } from './converter';

// Faithful port of ppy/osu TaikoAutoGenerator. Taiko replay frames carry no cursor
// position — only the four key bits (matching the bitfield decoded in input.ts).
// Pressing the right colour on each hit object's time makes the taiko judge
// (hitJudge.ts) re-derive all-300s → SS.
//
// Each press is a rising edge in the parser: the generator alternates hands inside a
// drum-roll (LeftCentre↔RightCentre) and cycles all four keys in a swell, so consecutive
// presses use different bits, and it drops one release frame after every object — so even
// a strong hit (both same-colour bits) clears before the next press registers.

// Stable .osr bitfield (bit 0=LeftCentre, 1=LeftRim, 2=RightCentre, 3=RightRim).
const LEFT_CENTRE  = 1;
const LEFT_RIM     = 2;
const RIGHT_CENTRE = 4;
const RIGHT_RIM    = 8;

const KEY_UP_DELAY = 50;     // button releases this long after an object's end (base AutoGenerator)
const SWELL_HIT_SPEED = 50;  // min ms between auto swell presses

// Swell auto cycles the four keys in order (lazer's d = 0,1,2,3); the centre/rim
// alternation satisfies the judge's per-press alternation rule, decrementing one hit each.
const SWELL_CYCLE = [LEFT_CENTRE, LEFT_RIM, RIGHT_CENTRE, RIGHT_RIM] as const;

function hitBits(hit: TaikoHit, hitButton: boolean): number {
  if (!hit.isRim) {
    return hit.isStrong ? LEFT_CENTRE | RIGHT_CENTRE : hitButton ? LEFT_CENTRE : RIGHT_CENTRE;
  }
  return hit.isStrong ? LEFT_RIM | RIGHT_RIM : hitButton ? LEFT_RIM : RIGHT_RIM;
}

/**
 * Generate a perfect ("Auto") taiko replay for `beatmap`: key-press frames that
 * score all-300s and clear every drum roll and swell under this library's judge.
 * `_modDiff` is kept for signature parity with the other rulesets' generators;
 * taiko conversion is mod-independent (raw difficulty — see convertBeatmapToTaiko),
 * so it's intentionally unused. Times are beatmap-clock milliseconds.
 */
export function generateTaikoAutoReplay(beatmap: BeatmapData, _modDiff: ModDifficulty): AutoFrame[] {
  const objects = convertBeatmapToTaiko(beatmap);
  if (objects.length === 0) return [];

  const frames: AutoFrame[] = [];
  const press = (time: number, keys: number): void => { frames.push({ time, x: 0, y: 0, keys }); };

  let hitButton = true;  // true = Left, false = Right

  press(objects[0]!.time - 1000, 0);

  for (let i = 0; i < objects.length; i++) {
    const h = objects[i]!;
    const endTime = h.kind === 'hit' ? h.time : h.endTime;

    if (h.kind === 'hit') {
      press(h.time, hitBits(h, hitButton));
    } else if (h.kind === 'drumroll') {
      // One press per pre-computed tick, alternating centre hands so each is a fresh edge.
      // Skip phantom ticks past endTime: the converter emits ticks up to endTime+tickInterval/2,
      // but the judge rejects presses with time > endTime, so pressing them would only ghost-tap.
      for (const tickTime of h.tickTimes) {
        if (tickTime > h.endTime) continue;
        press(tickTime, hitButton ? LEFT_CENTRE : RIGHT_CENTRE);
        hitButton = !hitButton;
      }
    } else {
      const req = h.requiredHits;
      const hitRate = Math.min(SWELL_HIT_SPEED, (h.endTime - h.time) / req);
      for (let count = 0; count < req; count++) {
        press(h.time + count * hitRate, SWELL_CYCLE[count % 4]!);
      }
    }

    // Release after the object: KEY_UP_DELAY past its end, but capped to 0.9× the gap to
    // the next object so the release always lands strictly before the next press.
    const next = objects[i + 1];
    const canDelay = next === undefined || next.time > endTime + KEY_UP_DELAY;
    const delay = canDelay ? KEY_UP_DELAY : (next!.time - endTime) * 0.9;
    press(endTime + delay, 0);

    hitButton = !hitButton;
  }

  return frames;
}
