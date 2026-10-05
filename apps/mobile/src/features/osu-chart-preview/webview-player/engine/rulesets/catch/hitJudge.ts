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

/** 位置判定按 float32 计算，避免盘沿边界翻转。 */
function caughtAtTime(path: readonly CatcherFrame[], time: number, effX: number, half: number): boolean {
  const cx = Math.fround(sampleCatcherX(path, time));
  return effX >= Math.fround(cx - half) && effX <= Math.fround(cx + half);
}

/** 仅在 StartTime 判定一维重叠：|物件 x−接盘者 x|≤接盘宽度/2。 */
export function computeCatchHitResults(
  objects: readonly CatchObject[],
  catcherPath: readonly CatcherFrame[],
  cs: number,
): HitResult[] {

  const half = Math.fround(calculateCatchWidth(cs) * 0.5);

  const ordered = [...objects].sort((a, b) => a.startTime - b.startTime);

  const results: HitResult[] = [];
  for (const obj of ordered) {

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
        /** 香蕉的 300 仅表示接到；香蕉不计准确率和 combo。 */

        results.push({ ...base, judgement: caught ? 300 : 0, comboBreak: false, comboIgnore: true });
        break;
    }
  }
  return results;
}
