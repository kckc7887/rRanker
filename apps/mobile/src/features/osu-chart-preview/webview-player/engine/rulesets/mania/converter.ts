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

/**
 * Port of osu.Game.Rulesets.Mania conversion for native (mode == 3) maps.
 * Single-stage only; std→mania converts (ManiaBeatmapConverter's pattern
 * generators) are not supported.
 */

/** mania-native column count: round(CS), clamped ≥1. */
function maniaColumnCount(beatmap: BeatmapData): number {
  return Math.max(1, Math.round(beatmap.circleSize));
}

/**
 * .osu stores column in x as `floor(x * totalColumns / 512)`.
 * The reverse mapping clamps into [0, totalColumns-1] to absorb the very rare
 * cases where x sits exactly on or past 512 (lazer does the same clamp).
 */
function columnForX(x: number, totalColumns: number): number {
  const col = Math.floor((x * totalColumns) / 512);
  if (col < 0) return 0;
  if (col >= totalColumns) return totalColumns - 1;
  return col;
}

/**
 * Convert a native mania beatmap into column-indexed objects. Column count is
 * round(CS) clamped ≥ 1; each object's x is mapped to a 0-based column via
 * `floor(x * totalColumns / 512)`. Applies the Mirror mod's column flip when
 * `modDiff.isMirror` is set. Returns a single stage plus all objects sorted by
 * start time (ties by column); the caller owns the returned arrays.
 */
export function convertBeatmapToMania(beatmap: BeatmapData, modDiff?: ModDifficulty): {
  stages: ManiaStage[];
  totalColumns: number;
  objects: ManiaHitObject[];
} {
  const totalColumns = maniaColumnCount(beatmap);
  const stages: ManiaStage[] = [{ columns: totalColumns, firstColumnIndex: 0 }];

  // Mania taps live in beatmap.hitObjects (as HitCircle entries; bit 0 of typeFlags);
  // holds live in the separate maniaHolds bucket. sourceIndex partitions the two:
  // notes use the hitObjects index; holds use `hitObjects.length + holdIndex`.
  // Consumers decode a sourceIndex back with a simple length comparison.
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

  // Mirror (ManiaModMirror, IApplicableToBeatmap): flip every column about the
  // playfield centre — `column → totalColumns - 1 - column`. Applied to the
  // converted objects only; replay input is left untouched (the player pressed
  // the mirrored keys, so the bitmask already lives in mirrored-column space).
  // Random is intentionally not handled (stable shuffle unrecoverable; skipped
  // for lazer per project scope).
  if (modDiff?.isMirror) {
    for (const o of objects) o.column = totalColumns - 1 - o.column;
  }

  // Sort by start time, ties by column index — mirrors lazer's JudgementOrderComparer
  // (end-time-then-column) for the common case where startTime == effective end time.
  objects.sort((a, b) => {
    const ta = a.kind === 'note' ? a.time : a.startTime;
    const tb = b.kind === 'note' ? b.time : b.startTime;
    if (ta !== tb) return ta - tb;
    return a.column - b.column;
  });

  return { stages, totalColumns, objects };
}

/**
 * Generate mania bar lines: one per beat, with `major` set on each measure
 * downbeat (every `meter` beats from the timing point's own start). Mirrors
 * osu.Game/Rulesets/Objects/BarLineGenerator.cs — the shared generator that
 * DrawableManiaRuleset feeds into the playfield. Cap at MAX_BAR_LINES to
 * protect against pathological timing point data.
 */
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
