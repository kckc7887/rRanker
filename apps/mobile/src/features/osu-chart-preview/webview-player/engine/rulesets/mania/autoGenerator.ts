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
import type { ManiaHitObject } from './types';
import { convertBeatmapToMania } from './converter';

/** 参考 ppy/osu ManiaAutoGenerator；x 保存当前全部按住列的位掩码。 */

const RELEASE_DELAY = 20;

interface ActionPoint {
  time: number;
  column: number;
  press: boolean;
}

const endTimeOf = (o: ManiaHitObject): number => (o.kind === 'note' ? o.time : o.endTime);
const startTimeOf = (o: ManiaHitObject): number => (o.kind === 'note' ? o.time : o.startTime);

export function generateManiaAutoReplay(beatmap: BeatmapData, modDiff: ModDifficulty): AutoFrame[] {
  const { objects, totalColumns } = convertBeatmapToMania(beatmap, modDiff);
  if (objects.length === 0) return [];

  const byColumn: ManiaHitObject[][] = Array.from({ length: totalColumns }, () => []);
  for (const o of objects) byColumn[o.column]?.push(o);

  const points: ActionPoint[] = [];
  for (const col of byColumn) {
    for (let i = 0; i < col.length; i++) {
      const obj = col[i]!;
      const next = col[i + 1];
      const endTime = endTimeOf(obj);

      /** 松键延迟最多为下一音符间隔的 0.9 倍，确保出现新按键沿。 */

      const canDelayKeyUp = next === undefined || startTimeOf(next) > endTime + RELEASE_DELAY;
      const delay = canDelayKeyUp ? RELEASE_DELAY : (startTimeOf(next!) - endTime) * 0.9;

      points.push({ time: startTimeOf(obj), column: obj.column, press: true });
      points.push({ time: endTime + delay, column: obj.column, press: false });
    }
  }

  points.sort((a, b) => a.time - b.time);

  const frames: AutoFrame[] = [];
  let mask = 0;
  let i = 0;
  while (i < points.length) {
    const t = points[i]!.time;
    while (i < points.length && points[i]!.time === t) {
      const p = points[i]!;
      if (p.press) mask |= 1 << p.column;
      else mask &= ~(1 << p.column);
      i++;
    }
    frames.push({ time: t, x: mask, y: 0, keys: 0 });
  }

  return frames;
}
