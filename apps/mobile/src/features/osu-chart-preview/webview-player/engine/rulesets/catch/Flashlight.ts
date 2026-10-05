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
/** 参考 ppy/osu CatchModFlashlight；光圈直接跟随接盘者。 */

import type { BeatmapData } from '../../types/index';
import type { ComboFrame } from '../../renderer/HUDRenderer';
import { drawFlashlightReveal } from '../../renderer/FlashlightReveal';

const CANVAS_W = 1280;
const CANVAS_H = 720;

const DEFAULT_FL_SIZE  = 203.125; /** 光圈半径用 osu!px，绘制时乘场地缩放。 */
const SIZE_MULTIPLIER  = 1.0;
const FL_SMOOTHNESS    = 1.4;
const FL_FADE_MS       = 800;
const BREAK_SCALE      = 2.5;
const COMBO_TIER1_MIN  = 100;
const COMBO_TIER2_MIN  = 200;
const COMBO_TIER1_MULT = 0.885;
const COMBO_TIER2_MULT = 0.770;
const BREAK_MIN_DURATION = FL_FADE_MS * 2;

interface Segment {
  tStart: number;
  tEnd:   number;
  vStart: number;
  vEnd:   number;
}

function comboTierMult(combo: number): number {
  if (combo >= COMBO_TIER2_MIN) return COMBO_TIER2_MULT;
  if (combo >= COMBO_TIER1_MIN) return COMBO_TIER1_MULT;
  return 1.0;
}

function evalSegments(segments: readonly Segment[], t: number, initial: number): number {
  if (segments.length === 0) return initial;
  let lo = 0, hi = segments.length - 1, idx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (segments[mid]!.tStart <= t) { idx = mid; lo = mid + 1; }
    else                            { hi = mid - 1; }
  }
  if (idx < 0) return segments[0]!.vStart;
  const seg = segments[idx]!;
  if (t >= seg.tEnd) return seg.vEnd;
  const u = (t - seg.tStart) / (seg.tEnd - seg.tStart);
  return seg.vStart + (seg.vEnd - seg.vStart) * u;
}

/** 新动画从当前值起步，并截断前一段。 */

function addEvent(segments: Segment[], initial: number, t: number, target: number): void {
  const startVal = evalSegments(segments, t, initial);
  if (segments.length > 0) {
    const last = segments[segments.length - 1]!;
    if (last.tEnd > t) {
      last.tEnd = t;
      last.vEnd = startVal;
    }
  }
  segments.push({ tStart: t, tEnd: t + FL_FADE_MS, vStart: startVal, vEnd: target });
}

function buildSizeTimeline(beatmap: BeatmapData, comboFrames: readonly ComboFrame[]): Segment[] {
  const segments: Segment[] = [];
  const baseSize = DEFAULT_FL_SIZE * SIZE_MULTIPLIER;

  type Evt =
    | { kind: 'combo'; t: number; combo: number }
    | { kind: 'breakStart'; t: number }
    | { kind: 'breakEndPrep'; t: number };

  const events: Evt[] = [];

  let lastTier = 1.0;
  for (const cf of comboFrames) {
    const tier = comboTierMult(cf.combo);
    if (tier !== lastTier) {
      events.push({ kind: 'combo', t: cf.time, combo: cf.combo });
      lastTier = tier;
    }
  }

  for (const b of beatmap.breaks) {
    if (b.endTime - b.startTime > BREAK_MIN_DURATION) {
      events.push({ kind: 'breakStart',   t: b.startTime });

      events.push({ kind: 'breakEndPrep', t: b.endTime - FL_FADE_MS });
    }
  }

  events.sort((a, b) => {
    if (a.t !== b.t) return a.t - b.t;
    const rank = (k: Evt['kind']): number =>
      k === 'combo' ? 0 : k === 'breakStart' ? 1 : 2;
    return rank(a.kind) - rank(b.kind);
  });

  let comboTarget = baseSize;
  for (const e of events) {
    if (e.kind === 'combo') {
      const newTarget = baseSize * comboTierMult(e.combo);
      if (newTarget !== comboTarget) {
        comboTarget = newTarget;
        addEvent(segments, baseSize, e.t, newTarget);
      }
    } else if (e.kind === 'breakStart') {
      addEvent(segments, baseSize, e.t, baseSize * BREAK_SCALE);
    } else {
      addEvent(segments, baseSize, e.t, comboTarget);
    }
  }
  return segments;
}

export class CatchFlashlight {
  private readonly sizeSegments: Segment[];
  private readonly initialSize = DEFAULT_FL_SIZE * SIZE_MULTIPLIER;

  constructor(
    beatmap: BeatmapData,
    comboFrames: readonly ComboFrame[],
    private readonly scale: number,
  ) {
    this.sizeSegments = buildSizeTimeline(beatmap, comboFrames);
  }

  draw(ctx: CanvasRenderingContext2D, timeMs: number, cx: number, cy: number): void {
    const sizeOsu = evalSegments(this.sizeSegments, timeMs, this.initialSize);
    const innerR = sizeOsu * this.scale;
    if (innerR <= 0) return;
    const outerR = innerR * FL_SMOOTHNESS;

    drawFlashlightReveal(ctx, cx, cy, outerR, 1 / FL_SMOOTHNESS, 0, 0, CANVAS_W, CANVAS_H);
  }
}
