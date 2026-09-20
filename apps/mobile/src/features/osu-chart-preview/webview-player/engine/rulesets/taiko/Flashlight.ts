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
/**
 * osu!taiko Flashlight overlay, following lazer's TaikoModFlashlight: a fixed
 * circle centred on the hit target whose size shrinks at combo tiers 100/200
 * and expands during breaks (800 ms tweens).
 *
 * Compositing note: a single source-over radial gradient (transparent at
 * center → smoothstep band → opaque black at outerR) over the already-drawn
 * gameplay. Beyond outerR the canvas spec extends with the offset-1 color
 * (opaque black), so one fillRect both reveals the hole and darkens the
 * corners. A destination-out approach would mark pixels transparent rather
 * than reveal underlying gameplay, so it can't work on the main canvas.
 */

import type { BeatmapData } from '../../types/index';
import type { ComboFrame } from '../../renderer/HUDRenderer';
import { drawFlashlightReveal } from '../../renderer/FlashlightReveal';

const DEFAULT_FL_SIZE       = 200;
const SIZE_MULTIPLIER       = 1.0;
const FL_SMOOTHNESS         = 1.4;
const FL_FADE_MS            = 800;
const BREAK_SCALE           = 2.5;
const COMBO_TIER1_MIN       = 100;
const COMBO_TIER2_MIN       = 200;
const COMBO_TIER1_MULT      = 0.8125;
const COMBO_TIER2_MULT      = 0.625;
const BREAK_MIN_DURATION    = FL_FADE_MS * 2;

// Must mirror Playfield.ts constants. FL darkens the input drum too.
const PLAYFIELD_LEFT_X  = 0;
const PLAYFIELD_RIGHT_X = 1280;
const PLAYFIELD_TOP_Y   = 260;
const PLAYFIELD_H_PX    = 200;
const HIT_TARGET_X      = 256;
const LANE_CENTRE_Y     = 360;
const PLAYFIELD_SCALE   = 1.0;

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

// If a tween is running, start from current value and truncate its end so the timeline stays single-valued.
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

function buildSizeTimeline(
  beatmap: BeatmapData,
  comboFrames: readonly ComboFrame[],
): Segment[] {
  const segments: Segment[] = [];
  const baseSize = DEFAULT_FL_SIZE * SIZE_MULTIPLIER;

  type Evt =
    | { kind: 'combo'; t: number; combo: number }
    | { kind: 'breakStart'; t: number }
    | { kind: 'breakEndPrep'; t: number };

  const events: Evt[] = [];

  // Filter to tier-boundary crossings only (compact timeline; same result as lazer).
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
      // Start the shrink-back so size lands at comboTarget exactly at b.endTime.
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

/**
 * Precomputed taiko flashlight. The constructor builds a piecewise-linear size
 * timeline from combo-tier crossings and break periods; `draw` evaluates it at
 * `timeMs` and paints the darken-with-reveal gradient over the finished frame.
 */
export class TaikoFlashlight {
  private readonly sizeSegments: Segment[];
  private readonly initialSize = DEFAULT_FL_SIZE * SIZE_MULTIPLIER;

  constructor(beatmap: BeatmapData, comboFrames: readonly ComboFrame[]) {
    this.sizeSegments = buildSizeTimeline(beatmap, comboFrames);
  }

  draw(ctx: CanvasRenderingContext2D, timeMs: number): void {
    const size   = evalSegments(this.sizeSegments, timeMs, this.initialSize) * PLAYFIELD_SCALE;
    if (size <= 0) return;
    const outerR = size * FL_SMOOTHNESS;

    drawFlashlightReveal(
      ctx, HIT_TARGET_X, LANE_CENTRE_Y, outerR, 1 / FL_SMOOTHNESS,
      PLAYFIELD_LEFT_X,
      PLAYFIELD_TOP_Y,
      PLAYFIELD_RIGHT_X - PLAYFIELD_LEFT_X,
      PLAYFIELD_H_PX,
    );
  }
}
