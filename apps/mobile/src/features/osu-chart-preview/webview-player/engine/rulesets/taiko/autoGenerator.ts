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

/** 参考 ppy/osu TaikoAutoGenerator；同一颜色交替左右手，保证新按键沿。 */

const LEFT_CENTRE  = 1;
const LEFT_RIM     = 2;
const RIGHT_CENTRE = 4;
const RIGHT_RIM    = 8;

const KEY_UP_DELAY = 50;
const SWELL_HIT_SPEED = 50;

const SWELL_CYCLE = [LEFT_CENTRE, LEFT_RIM, RIGHT_CENTRE, RIGHT_RIM] as const;

function hitBits(hit: TaikoHit, hitButton: boolean): number {
  if (!hit.isRim) {
    return hit.isStrong ? LEFT_CENTRE | RIGHT_CENTRE : hitButton ? LEFT_CENTRE : RIGHT_CENTRE;
  }
  return hit.isStrong ? LEFT_RIM | RIGHT_RIM : hitButton ? LEFT_RIM : RIGHT_RIM;
}

export function* generateTaikoAutoReplay(beatmap: BeatmapData, _modDiff: ModDifficulty): Generator<AutoFrame> {
  const objects = convertBeatmapToTaiko(beatmap);
  if (objects.length === 0) return;

  const press = (time: number, keys: number): AutoFrame => ({ time, x: 0, y: 0, keys });

  let hitButton = true;

  yield press(objects[0]!.time - 1000, 0);

  for (let i = 0; i < objects.length; i++) {
    const h = objects[i]!;
    const endTime = h.kind === 'hit' ? h.time : h.endTime;

    if (h.kind === 'hit') {
      yield press(h.time, hitBits(h, hitButton));
    } else if (h.kind === 'drumroll') {
      /** 只按结束时间内的 tick，排除转换器允许生成的末端额外 tick。 */

      for (let tick = 0; tick < h.tickCount; tick++) {
        const tickTime = h.time + tick * h.tickInterval;
        if (tickTime > h.endTime) continue;
        yield press(tickTime, hitButton ? LEFT_CENTRE : RIGHT_CENTRE);
        hitButton = !hitButton;
      }
    } else {
      const req = h.requiredHits;
      const hitRate = Math.min(SWELL_HIT_SPEED, (h.endTime - h.time) / req);
      for (let count = 0; count < req; count++) {
        yield press(h.time + count * hitRate, SWELL_CYCLE[count % 4]!);
      }
    }

    const next = objects[i + 1];
    const canDelay = next === undefined || next.time > endTime + KEY_UP_DELAY;
    const delay = canDelay ? KEY_UP_DELAY : (next!.time - endTime) * 0.9;
    yield press(endTime + delay, 0);

    hitButton = !hitButton;
  }

}
