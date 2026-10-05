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
import type { BeatmapData, HitCircle, Slider } from '../types/index';
import type { ModDifficulty } from './modDifficulty';
import { slideDurationMs } from './sliderDuration';
import { sampleSlider } from '../renderer/SliderGeometry';

/** 堆叠偏移为 stackHeight×radius/10；v6 起向后遍历，之前向前遍历。 */

const STACK_DISTANCE = 3;

function objectEndTime(beatmap: BeatmapData, obj: BeatmapData['hitObjects'][number]): number {
  if (obj.type === 'slider') {
    const dur = slideDurationMs(beatmap, obj as Slider);
    return obj.time + dur * (obj as Slider).slides;
  }
  if (obj.type === 'spinner') return (obj as { endTime: number }).endTime;
  return obj.time;
}

/** 尾部堆叠按实际路径终点，不能用最后控制点。 */

const sliderEndCache = new WeakMap<Slider, { x: number; y: number }>();
function sliderEndPos(slider: Slider): { x: number; y: number } {
  if (slider.slides % 2 === 0) return { x: slider.x, y: slider.y };
  const cached = sliderEndCache.get(slider);
  if (cached) return cached;
  const path = sampleSlider(slider);
  const end = path.length > 0
    ? { x: path[path.length - 1]!.x, y: path[path.length - 1]!.y }
    : { x: slider.x, y: slider.y };
  sliderEndCache.set(slider, end);
  return end;
}

export function applyStacking(beatmap: BeatmapData, modDiff: ModDifficulty): void {
  const objs = beatmap.hitObjects;
  if (objs.length === 0) return;

  for (const obj of objs) {
    if (obj.type !== 'spinner') obj.stackHeight = 0;
  }

  if (beatmap.formatVersion >= 6) applyNewStacking(beatmap, modDiff);
  else                            applyOldStacking(beatmap, modDiff);
}

function applyNewStacking(beatmap: BeatmapData, modDiff: ModDifficulty): void {
  const objs = beatmap.hitObjects;
  const n = objs.length;
  const stackThreshold = modDiff.preemptMs * beatmap.stackLeniency;

  for (let i = n - 1; i > 0; i--) {
    const objI = objs[i]!;
    if (objI.type === 'spinner') continue;
    if (objI.stackHeight !== 0) continue;

    if (objI.type === 'circle') {
      let curI = i;
      for (let j = curI - 1; j >= 0; j--) {
        const objJ = objs[j]!;
        if (objJ.type === 'spinner') continue;

        const endTimeJ = objectEndTime(beatmap, objJ);
        if (objs[curI]!.time - endTimeJ > stackThreshold) break;

        if (objJ.type === 'slider') {
          const tail = sliderEndPos(objJ as Slider);

          const cur = objs[curI] as HitCircle | Slider;
          const dx = tail.x - cur.x;
          const dy = tail.y - cur.y;
          if (dx * dx + dy * dy < STACK_DISTANCE * STACK_DISTANCE) {
            const offset = cur.stackHeight - (objJ as Slider).stackHeight + 1;
            for (let k = j + 1; k <= i; k++) {
              const objK = objs[k]!;
              if (objK.type === 'spinner') continue;
              const tdx = tail.x - objK.x;
              const tdy = tail.y - objK.y;
              if (tdx * tdx + tdy * tdy < STACK_DISTANCE * STACK_DISTANCE) {
                objK.stackHeight -= offset;
              }
            }
            break;
          }
        }

        const cur = objs[curI] as HitCircle | Slider;
        const dx = objJ.x - cur.x;
        const dy = objJ.y - cur.y;
        if (dx * dx + dy * dy < STACK_DISTANCE * STACK_DISTANCE) {
          objJ.stackHeight = cur.stackHeight + 1;
          curI = j;
        }
      }
    } else {
      let curI = i;
      for (let j = curI - 1; j >= 0; j--) {
        const objJ = objs[j]!;
        if (objJ.type === 'spinner') continue;

        if (objs[curI]!.time - objJ.time > stackThreshold) break;

        const endPosJ = objJ.type === 'slider'
          ? sliderEndPos(objJ as Slider)
          : { x: objJ.x, y: objJ.y };
        const cur = objs[curI] as HitCircle | Slider;
        const dx = endPosJ.x - cur.x;
        const dy = endPosJ.y - cur.y;
        if (dx * dx + dy * dy < STACK_DISTANCE * STACK_DISTANCE) {
          objJ.stackHeight = cur.stackHeight + 1;
          curI = j;
        }
      }
    }
  }
}

function applyOldStacking(beatmap: BeatmapData, modDiff: ModDifficulty): void {
  const objs = beatmap.hitObjects;
  const n = objs.length;
  const stackThreshold = modDiff.preemptMs * beatmap.stackLeniency;

  for (let i = 0; i < n; i++) {
    const objI = objs[i]!;
    if (objI.type === 'spinner') continue;
    if (objI.stackHeight !== 0 && objI.type !== 'slider') continue;

    let startTime = objectEndTime(beatmap, objI);
    let sliderStack = 0;

    const iEndPos = objI.type === 'slider'
      ? sliderEndPos(objI as Slider)
      : { x: objI.x, y: objI.y };

    for (let j = i + 1; j < n; j++) {
      const objJ = objs[j]!;
      if (objJ.type === 'spinner') continue;
      if (objJ.time - startTime > stackThreshold) break;

      const dxStart = objJ.x - objI.x;
      const dyStart = objJ.y - objI.y;
      if (dxStart * dxStart + dyStart * dyStart < STACK_DISTANCE * STACK_DISTANCE) {
        objI.stackHeight++;
        startTime = objectEndTime(beatmap, objJ);
        continue;
      }

      if (objI.type === 'slider') {
        const dxEnd = objJ.x - iEndPos.x;
        const dyEnd = objJ.y - iEndPos.y;
        if (dxEnd * dxEnd + dyEnd * dyEnd < STACK_DISTANCE * STACK_DISTANCE) {
          sliderStack++;
          objJ.stackHeight -= sliderStack;
          startTime = objectEndTime(beatmap, objJ);
        }
      }
    }
  }
}
