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

/** 参考 ppy/osu CatchBeatmapProcessor；同一随机流按物件生成顺序抽样。 */

const WIDTH = 512;
const RNG_SEED = 1337;
const ALLOWED_CATCH_RANGE = 0.8;
const BASE_DASH_SPEED = 1.0;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function applyPositionOffsets(objects: CatchObject[], beatmap: BeatmapData, modDiff: ModDifficulty): void {
  const rng = new LegacyRandom(RNG_SEED);
  const hardRock = modDiff.isHR;

  let lastPosition: number | null = null;
  let lastStartTime = 0;

  let i = 0;
  while (i < objects.length) {
    const src = objects[i]!.sourceIndex;
    let j = i;
    while (j < objects.length && objects[j]!.sourceIndex === src) j++;
    const top = beatmap.hitObjects[src];

    if (top?.type === 'circle') {

      const fruit = objects[i]!;
      fruit.xOffset = 0;
      if (hardRock) {
        const r = applyHardRockOffset(fruit, lastPosition, lastStartTime, rng);
        lastPosition = r.lastPosition;
        lastStartTime = r.lastStartTime;
      }
    } else if (top?.type === 'spinner') {
      /** 每根香蕉消耗 4 次随机数，后三次对应类型、旋转与颜色。 */

      for (let k = i; k < j; k++) {
        const banana = objects[k]!;
        banana.xOffset = Math.fround(rng.nextDouble() * WIDTH);
        rng.next();
        rng.next();
        rng.next();
      }
    } else if (top?.type === 'slider') {
      /** 沿用上游规则：记录最后控制点和起始时间，而非路径终点与结束时间。 */

      const cps = top.curvePoints;
      lastPosition = Math.fround(cps[cps.length - 1]!.x);
      lastStartTime = top.time;

      for (let k = i; k < j; k++) {
        const nested = objects[k]!;
        nested.xOffset = 0;
        if (nested.type === 'tinyDroplet') {

          nested.xOffset = Math.fround(
            clamp(rng.nextIntRange(-20, 20), -nested.originalX, WIDTH - nested.originalX),
          );
        } else if (nested.type === 'droplet') {
          rng.next(); /** 消耗 stable 水滴旋转的随机数。 */
        }

      }
    }

    i = j;
  }

  for (const obj of objects) {
    obj.effectiveX = Math.fround(clamp(obj.originalX + obj.xOffset, 0, WIDTH));
  }

  initialiseHyperDash(objects, modDiff.cs);

  /** Mirror 在偏移和 hyperdash 计算后反射位置。 */

  if (modDiff.isMirror) {
    for (const obj of objects) {
      obj.effectiveX = Math.fround(WIDTH - obj.effectiveX);
      if (obj.hyperDashTargetX !== undefined) {
        obj.hyperDashTargetX = Math.fround(WIDTH - obj.hyperDashTargetX);
      }
    }
  }
}

/** 重叠音符的随机偏移分支不更新前次位置与时间。 */
function applyHardRockOffset(
  obj: CatchObject,
  lastPosition: number | null,
  lastStartTime: number,
  rng: LegacyRandom,
): { lastPosition: number | null; lastStartTime: number } {
  let offsetPosition = obj.originalX;
  const startTime = obj.startTime;

  if (lastPosition === null || lastPosition === 0) {
    return { lastPosition: offsetPosition, lastStartTime: startTime };
  }

  const positionDiff = Math.fround(offsetPosition - lastPosition);
  const timeDiff = Math.trunc(startTime - lastStartTime);

  if (timeDiff > 1000) {
    return { lastPosition: offsetPosition, lastStartTime: startTime };
  }

  if (positionDiff === 0) {
    /** 重叠偏移的上限为 timeDiff/4，且不更新前次状态。 */

    offsetPosition = applyRandomOffset(offsetPosition, timeDiff / 4, rng);
    obj.xOffset = Math.fround(offsetPosition - obj.originalX);
    return { lastPosition, lastStartTime };
  }

  if (Math.abs(positionDiff) < Math.trunc(timeDiff / 3)) {
    /** timeDiff/3 按整数除法截断。 */
    offsetPosition = applyOffset(offsetPosition, positionDiff);
  }

  obj.xOffset = Math.fround(offsetPosition - obj.originalX);
  return { lastPosition: offsetPosition, lastStartTime: startTime };
}

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

function applyOffset(position: number, amount: number): number {
  if (amount > 0) {
    if (position + amount < WIDTH) position += amount;
  } else {
    if (position + amount > 0) position += amount;
  }
  return Math.fround(position);
}

/** hyperdash 只计算水果和非 tiny 水滴，使用不含 0.8 边距系数的盘宽。 */
function initialiseHyperDash(objects: CatchObject[], cs: number): void {
  const palpable = objects
    .filter((o) => o.type === 'fruit' || o.type === 'droplet')
    .sort((a, b) => a.startTime - b.startTime);

  let halfCatcherWidth = calculateCatchWidth(cs) / 2;
  halfCatcherWidth /= ALLOWED_CATCH_RANGE;

  let lastDirection = 0;
  let lastExcess = halfCatcherWidth;

  for (let i = 0; i < palpable.length - 1; i++) {
    const cur = palpable[i]!;
    const nxt = palpable[i + 1]!;

    cur.hyperDash = false;
    cur.hyperDashTargetX = undefined;
    cur.distanceToHyperDash = 0;

    const thisDirection = nxt.effectiveX > cur.effectiveX ? 1 : -1;
    /** 起始时间取整后，扣除四分之一帧宽限。 */
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
