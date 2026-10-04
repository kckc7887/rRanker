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
import type { BeatmapData, TimingPoint } from '../../types/index';
import type { ModDifficulty } from '../../utils/modDifficulty';
import type { ManiaHitObject, ManiaNote, ManiaHoldNote, ManiaBarLine, ManiaStage } from './types';

/** 参考 ppy/osu ManiaBeatmapConverter；仅支持原生单场地 mania 谱面。 */

function maniaColumnCount(beatmap: BeatmapData): number {
  return Math.max(1, Math.round(beatmap.circleSize));
}

function columnForX(x: number, totalColumns: number): number {
  const col = Math.floor((x * totalColumns) / 512);
  if (col < 0) return 0;
  if (col >= totalColumns) return totalColumns - 1;
  return col;
}

export function convertBeatmapToMania(beatmap: BeatmapData, modDiff?: ModDifficulty): {
  stages: ManiaStage[];
  totalColumns: number;
  objects: ManiaHitObject[];
} {
  const totalColumns = maniaColumnCount(beatmap);
  const stages: ManiaStage[] = [{ columns: totalColumns, firstColumnIndex: 0 }];

  /** tap 索引在 hitObjects 内，hold 索引从 hitObjects.length 起算。 */

  const objects: ManiaHitObject[] = [];
  for (let i = 0; i < beatmap.hitObjects.length; i++) {
    const obj = beatmap.hitObjects[i];
    if (obj === undefined || obj.type !== 'circle') continue;
    const note: ManiaNote = {
      kind: 'note',
      time: obj.time,
      column: columnForX(obj.x, totalColumns),
      hitSound: obj.hitSound,
      hitSample: obj.hitSample,
      sourceIndex: i,
    };
    objects.push(note);
  }
  const holdSourceOffset = beatmap.hitObjects.length;
  for (let j = 0; j < beatmap.maniaHolds.length; j++) {
    const hold = beatmap.maniaHolds[j]!;
    const ln: ManiaHoldNote = {
      kind: 'hold',
      startTime: hold.time,
      endTime: hold.endTime,
      column: columnForX(hold.x, totalColumns),
      hitSound: hold.hitSound,
      hitSample: hold.hitSample,
      sourceIndex: holdSourceOffset + j,
    };
    objects.push(ln);
  }

  /** Mirror 仅翻转音符列；回放位掩码已处于翻转后的空间。 */

  if (modDiff?.isMirror) {
    for (const o of objects) o.column = totalColumns - 1 - o.column;
  }

  objects.sort((a, b) => {
    const ta = a.kind === 'note' ? a.time : a.startTime;
    const tb = b.kind === 'note' ? b.time : b.startTime;
    if (ta !== tb) return ta - tb;
    return a.column - b.column;
  });

  return { stages, totalColumns, objects };
}

export function computeManiaBarLines(beatmap: BeatmapData): ManiaBarLine[] {
  const uninherited: TimingPoint[] = [];
  for (const tp of beatmap.timingPoints) if (!tp.inherited) uninherited.push(tp);
  if (uninherited.length === 0) return [];

  let endTime = 0;
  for (const obj of beatmap.hitObjects) {
    const t = obj.type === 'spinner' ? obj.endTime : obj.time;
    if (t > endTime) endTime = t;
  }
  for (const h of beatmap.maniaHolds) {
    if (h.endTime > endTime) endTime = h.endTime;
  }
  endTime += 2000;

  const lines: ManiaBarLine[] = [];
  const MAX_BAR_LINES = 200000;
  for (let i = 0; i < uninherited.length; i++) {
    const tp = uninherited[i]!;
    const next = i + 1 < uninherited.length ? uninherited[i + 1]!.time : endTime;
    const step = tp.beatLength;
    const meter = Math.max(1, tp.meter);
    if (step <= 0) continue;
    let beatIndex = 0;
    for (let t = tp.time; t < next; t += step) {
      lines.push({ time: t, major: beatIndex % meter === 0 });
      beatIndex++;
      if (lines.length >= MAX_BAR_LINES) return lines;
    }
  }
  return lines;
}
