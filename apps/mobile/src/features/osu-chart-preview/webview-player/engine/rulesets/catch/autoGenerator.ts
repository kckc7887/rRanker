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

/** 参考 ppy/osu CatchAutoGenerator。 */

/** x 保存 0..512 接盘者位置，keys=1 表示 Dash。 */

const CENTER_X = 256;
const BASE_DASH_SPEED = 1.0;
const BASE_WALK_SPEED = 0.5;

export function generateCatchAutoReplay(objects: readonly CatchObject[], modDiff: ModDifficulty): AutoFrame[] {
  if (objects.length === 0) return [];

  const frames: AutoFrame[] = [];
  /** y=0，避免被当作 stable 的 y=-500 前导占位。 */

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

    if (timeAvailable < 0) continue;

    const speedRequired = positionChange === 0 ? 0 : positionChange / timeAvailable;
    const dashRequired = speedRequired > BASE_WALK_SPEED;
    const impossibleJump = speedRequired > BASE_DASH_SPEED;

    if (lastPosition - halfCatcherWidth < effX && lastPosition + halfCatcherWidth > effX) {

      lastTime = h.startTime;
      addFrame(h.startTime, lastPosition);
      continue;
    }

    if (impossibleJump) {

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
