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
import type { CatchObject } from './types';
import type { ModDifficulty } from '../../utils/modDifficulty';
import type { AutoFrame } from '../../utils/autoReplay';
import { calculateCatchWidth } from './converter';

// Faithful port of ppy/osu osu.Game.Rulesets.Catch/Replays/CatchAutoGenerator.cs.
//
// Catch input is a continuous catcher X (legacy MouseX, osu-px 0..512, packed into the
// AutoFrame.x field) plus one dash bit (CatchAction.Dash → Left1 = bit 0, in keys). The
// catchFrames decoder (input.ts) reads x as the catcher position and `keys === 1` as dash;
// computeCatchHitResults samples the interpolated catcher X at each palpable object's
// startTime and runs the 1-D overlap test against effectiveX. So placing the catcher exactly
// on each object's effectiveX at its startTime re-derives all-caught → SS. Dash is decorative
// for judgement; we reproduce lazer's dash-bit semantics anyway for faithful
// trail/key-overlay visuals.

const CENTER_X = 256;          // CatchPlayfield.CENTER_X
const BASE_DASH_SPEED = 1.0;   // Catcher.BASE_DASH_SPEED (px/ms)
const BASE_WALK_SPEED = 0.5;   // Catcher.BASE_WALK_SPEED (px/ms)

/**
 * Generate a perfect ("Auto") catch replay: a time-sorted AutoFrame list whose catcher path
 * catches every palpable object. `objects` must be the flat palpable list AFTER
 * `applyPositionOffsets` (effectiveX + hyperDash are read here) and in generation order
 * (top-level beatmap order, nested in emit order) — lazer's generator iterates HitObjects +
 * nested palpables in exactly that order, which our converter preserves.
 */
export function generateCatchAutoReplay(objects: readonly CatchObject[], modDiff: ModDifficulty): AutoFrame[] {
  if (objects.length === 0) return [];

  const frames: AutoFrame[] = [];
  // y is unused by catch (catchFrames ignores MouseY); 0 ≠ the −500 lead-in sentinel, so a
  // generated frame is never mistaken for a stable lead-in placeholder.
  const addFrame = (time: number, x: number, dashing = false): void => {
    frames.push({ time, x, y: 0, keys: dashing ? 1 : 0 });
  };

  const halfCatcherWidth = Math.fround(calculateCatchWidth(modDiff.cs) * 0.5);

  let lastPosition = CENTER_X;
  let lastTime = 0;

  for (const h of objects) {
    const effX = h.effectiveX;
    const positionChange = Math.abs(lastPosition - effX);
    const timeAvailable = h.startTime - lastTime;

    if (timeAvailable < 0) continue;   // object overlaps the previous one — lazer skips it

    const speedRequired = positionChange === 0 ? 0 : positionChange / timeAvailable;
    const dashRequired = speedRequired > BASE_WALK_SPEED;
    const impossibleJump = speedRequired > BASE_DASH_SPEED;

    if (lastPosition - halfCatcherWidth < effX && lastPosition + halfCatcherWidth > effX) {
      // Catcher already overlaps the object — stay put (lastPosition left unchanged, like lazer).
      lastTime = h.startTime;
      addFrame(h.startTime, lastPosition);
      continue;
    }

    if (impossibleJump) {
      // Unreachable even at dash speed: teleport (matches lazer; harmless — judge samples here).
      addFrame(h.startTime, effX);
    } else if (h.hyperDash) {
      addFrame(h.startTime - timeAvailable, lastPosition);
      addFrame(h.startTime, effX);
    } else if (dashRequired) {
      const timeAtNormalSpeed = positionChange / BASE_WALK_SPEED;
      const timeWeNeedToSave = timeAtNormalSpeed - timeAvailable;
      const timeAtDashSpeed = timeWeNeedToSave / 2;
      const amount = Math.fround(Math.fround(timeAtDashSpeed) / timeAvailable);
      const midPosition = Math.fround(lastPosition + (effX - lastPosition) * amount);

      addFrame(h.startTime - timeAvailable + 1, lastPosition, true);
      addFrame(h.startTime - timeAvailable + timeAtDashSpeed, midPosition);
      addFrame(h.startTime, effX);
    } else {
      const timeBefore = positionChange / BASE_WALK_SPEED;
      addFrame(h.startTime - timeBefore, lastPosition);
      addFrame(h.startTime, effX);
    }

    lastTime = h.startTime;
    lastPosition = effX;
  }

  return frames;
}
