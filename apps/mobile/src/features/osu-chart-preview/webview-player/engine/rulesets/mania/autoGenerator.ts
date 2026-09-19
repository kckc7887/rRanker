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

// Faithful port of ppy/osu ManiaAutoGenerator. Mania replay frames pack the pressed
// columns as a bitmask into the MouseX (x) field — LSB = column 0 — exactly what the
// input decoder (maniaFrames) diffs back into per-column press/release edges. Pressing
// each object's column on its start time (and releasing the head at its end time) makes
// the OrderedHitPolicy judge (computeManiaHitResults) re-derive all-Perfects → SS.
//
// Like lazer, each object contributes a HitPoint (press) at startTime and a ReleasePoint
// (release) shortly after its end. Points are grouped by time and each group emits one
// frame carrying the CUMULATIVE held-column mask — the decoder treats x as the absolute
// current state, so every frame must reflect all columns held at that instant.

// ManiaAutoGenerator.RELEASE_DELAY — the key is lifted this long after an object's end.
// 20 ms keeps a HoldNote tail within Perfect (20/RELEASE_LENIENCE = 13.3 ms ≤ the 15.5 ms
// stable Perfect window), and the gap-capped variant below keeps a tap's release strictly
// before the next press in its column so each press is a fresh rising edge.
const RELEASE_DELAY = 20;

interface ActionPoint {
  time: number;
  column: number;
  press: boolean;
}

const endTimeOf = (o: ManiaHitObject): number => (o.kind === 'note' ? o.time : o.endTime);
const startTimeOf = (o: ManiaHitObject): number => (o.kind === 'note' ? o.time : o.startTime);

/**
 * Generate perfect-play replay frames for a native mania beatmap (the Auto mod).
 * Each frame's `x` carries the cumulative held-column bitmask at that time (ms);
 * `y`/`keys` are unused in mania. Feeding the result through the normal input
 * decoder + judge yields all-Perfect results.
 */
export function generateManiaAutoReplay(beatmap: BeatmapData, modDiff: ModDifficulty): AutoFrame[] {
  const { objects, totalColumns } = convertBeatmapToMania(beatmap, modDiff);
  if (objects.length === 0) return [];

  // Per-column object lists (objects are globally sorted by start time, ties by column, so
  // each column's slice stays start-ordered). Used to find the next object in the same
  // column — lazer's GetNextObject — which bounds the release delay.
  const byColumn: ManiaHitObject[][] = Array.from({ length: totalColumns }, () => []);
  for (const o of objects) byColumn[o.column]?.push(o);

  const points: ActionPoint[] = [];
  for (const col of byColumn) {
    for (let i = 0; i < col.length; i++) {
      const obj = col[i]!;
      const next = col[i + 1];
      const endTime = endTimeOf(obj);

      // Release RELEASE_DELAY after the end, unless the next note in this column comes too
      // soon — then release at 0.9× of the gap so it always lands before the next press.
      const canDelayKeyUp = next === undefined || startTimeOf(next) > endTime + RELEASE_DELAY;
      const delay = canDelayKeyUp ? RELEASE_DELAY : (startTimeOf(next!) - endTime) * 0.9;

      points.push({ time: startTimeOf(obj), column: obj.column, press: true });
      points.push({ time: endTime + delay, column: obj.column, press: false });
    }
  }

  // synthesizeAutoReplay stable-sorts as a safety net, but the mask is already correct per distinct time.
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
