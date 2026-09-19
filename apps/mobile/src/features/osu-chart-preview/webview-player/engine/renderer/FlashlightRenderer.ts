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
import type { BeatmapData, ReplayData, HitResult, ReplayFrame } from '../types/index';
import type { ModDifficulty } from '../utils/modDifficulty';
import { computeComboTimeline } from './HUDRenderer';

// Must match HitObjectRenderer / CursorRenderer.
const CANVAS_W = 1280;
const CANVAS_H = 720;
const PLAYFIELD_W = 512;
const PLAYFIELD_H = 384;
const SCALE = Math.min(800 / PLAYFIELD_W, 600 / PLAYFIELD_H) * 0.9;
const OFFSET_X = (CANVAS_W - PLAYFIELD_W * SCALE) / 2;
const OFFSET_Y = (CANVAS_H - PLAYFIELD_H * SCALE) / 2;

// osu!stable / Danser values.
const DEFAULT_FL_SIZE      = 168;    // osu! pixels
const INTRO_START_SIZE     = DEFAULT_FL_SIZE * 8;
const BREAK_SIZE           = DEFAULT_FL_SIZE * 2.5;
const FL_DURATION_MS       = 800;
const BREAK_MIN_DURATION   = FL_DURATION_MS * 2;
const FOLLOW_DELAY_MS      = 120;
const SLIDER_DIM           = 0.8;
const DIM_TRANSITION_MS    = 50;
const MAX_DIM              = 1.0;
const CURSOR_STEP_MS       = 16;

const TIER1_COMBO_MIN = 100;
const TIER2_COMBO_MIN = 200;
const TIER1_MULT = 0.8125;
const TIER2_MULT = 0.625;

function tierSize(combo: number): number {
  if (combo > TIER2_COMBO_MIN) return DEFAULT_FL_SIZE * TIER2_MULT;
  if (combo > TIER1_COMBO_MIN) return DEFAULT_FL_SIZE * TIER1_MULT;
  return DEFAULT_FL_SIZE;
}

type Ease = 'linear' | 'outQuad';

interface Segment {
  tStart: number;
  tEnd:   number;
  vStart: number;
  vEnd:   number;
  ease:   Ease;
}

function evaluateSegments(
  segments: readonly Segment[],
  t: number,
  initial: number,
): number {
  if (segments.length === 0) return initial;
  let lo = 0;
  let hi = segments.length - 1;
  let idx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (segments[mid]!.tStart <= t) { idx = mid; lo = mid + 1; }
    else                            { hi = mid - 1; }
  }
  if (idx < 0) {
    const first = segments[0]!;
    return first.vStart;
  }
  const seg = segments[idx]!;
  if (t >= seg.tEnd) return seg.vEnd;
  const u = (t - seg.tStart) / (seg.tEnd - seg.tStart);
  const eu = seg.ease === 'outQuad' ? 1 - (1 - u) * (1 - u) : u;
  return seg.vStart + (seg.vEnd - seg.vStart) * eu;
}

// Truncates any in-flight previous segment to keep the piecewise function single-valued.
function addTimelineEvent(
  segments: Segment[],
  initial: number,
  t: number,
  target: number,
  duration: number,
  ease: Ease,
): void {
  const startVal = evaluateSegments(segments, t, initial);
  if (segments.length > 0) {
    const last = segments[segments.length - 1]!;
    if (last.tEnd > t) {
      last.tEnd = t;
      last.vEnd = startVal;
    }
  }
  segments.push({ tStart: t, tEnd: t + duration, vStart: startVal, vEnd: target, ease });
}

interface SmoothedCursor {
  startTimeMs: number;
  stepMs: number;
  xs: Float32Array;
  ys: Float32Array;
}

function buildCumTimes(frames: readonly ReplayFrame[]): number[] {
  const out = new Array<number>(frames.length);
  let acc = 0;
  for (let i = 0; i < frames.length; i++) {
    acc += frames[i]!.timeDelta;
    out[i] = acc;
  }
  return out;
}

function cursorAtTime(
  frames: readonly ReplayFrame[],
  cumTimes: readonly number[],
  t: number,
  hintIdx: number,
): { x: number; y: number; idx: number } {
  let idx = hintIdx;
  while (idx + 1 < frames.length && cumTimes[idx + 1]! <= t) idx++;
  if (idx >= frames.length - 1) {
    const f = frames[frames.length - 1]!;
    return { x: f.x, y: f.y, idx };
  }
  const t0 = cumTimes[idx]!;
  const t1 = cumTimes[idx + 1]!;
  const dt = t1 - t0;
  const frac = dt < 1e-6 ? 0 : (t - t0) / dt;
  const f0 = frames[idx]!;
  const f1 = frames[idx + 1]!;
  return {
    x: f0.x + (f1.x - f0.x) * frac,
    y: f0.y + (f1.y - f0.y) * frac,
    idx,
  };
}

// Danser-style 120ms OutQuad lerp at fixed CURSOR_STEP_MS cadence; render lookup is O(1).
function buildSmoothedCursor(replay: ReplayData): SmoothedCursor {
  const frames = replay.frames;
  if (frames.length === 0) {
    return { startTimeMs: 0, stepMs: CURSOR_STEP_MS, xs: new Float32Array(0), ys: new Float32Array(0) };
  }
  const cumTimes = buildCumTimes(frames);
  const tFirst = cumTimes[0]!;
  const tLast  = cumTimes[cumTimes.length - 1]!;
  const span   = Math.max(0, tLast - tFirst);
  const numSteps = Math.ceil(span / CURSOR_STEP_MS) + 1;

  const xs = new Float32Array(numSteps);
  const ys = new Float32Array(numSteps);

  let sx = frames[0]!.x;
  let sy = frames[0]!.y;
  xs[0] = sx; ys[0] = sy;

  const uStep = Math.min(CURSOR_STEP_MS, FOLLOW_DELAY_MS) / FOLLOW_DELAY_MS;
  const eStep = 1 - (1 - uStep) * (1 - uStep);

  let hintIdx = 0;
  for (let i = 1; i < numSteps; i++) {
    const t = tFirst + i * CURSOR_STEP_MS;
    const c = cursorAtTime(frames, cumTimes, t, hintIdx);
    hintIdx = c.idx;
    sx = sx + (c.x - sx) * eStep;
    sy = sy + (c.y - sy) * eStep;
    xs[i] = sx;
    ys[i] = sy;
  }

  return { startTimeMs: tFirst, stepMs: CURSOR_STEP_MS, xs, ys };
}

function smoothedAt(sc: SmoothedCursor, timeMs: number): { x: number; y: number } {
  const n = sc.xs.length;
  if (n === 0) return { x: 256, y: 192 };
  const idxF = (timeMs - sc.startTimeMs) / sc.stepMs;
  if (idxF <= 0)         return { x: sc.xs[0]!,     y: sc.ys[0]! };
  if (idxF >= n - 1)     return { x: sc.xs[n - 1]!, y: sc.ys[n - 1]! };
  const i = Math.floor(idxF);
  const frac = idxF - i;
  return {
    x: sc.xs[i]! + (sc.xs[i + 1]! - sc.xs[i]!) * frac,
    y: sc.ys[i]! + (sc.ys[i + 1]! - sc.ys[i]!) * frac,
  };
}

let _falloffBitmap: OffscreenCanvas | null = null;

// Alpha channel = 1 - (r/R)^5 = erase weight for destination-out blit.
function getFalloffBitmap(): OffscreenCanvas {
  if (_falloffBitmap !== null) return _falloffBitmap;
  const SIZE = 512;
  const osc = new OffscreenCanvas(SIZE, SIZE);
  const ctx = osc.getContext('2d')!;
  const cx = SIZE / 2;
  const grad = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx);
  const N = 40;
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const a = 1 - Math.pow(u, 5);
    grad.addColorStop(u, `rgba(0, 0, 0, ${a})`);
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, SIZE, SIZE);
  _falloffBitmap = osc;
  return osc;
}

/** Precomputed flashlight state: beam-size and slider-dim animation segments plus the
 * delay-smoothed cursor track. Built once in the {@link Flashlight} constructor. */
export interface FlashlightTimelines {
  sizeSegments: Segment[];
  dimSegments:  Segment[];
  smoothed:     SmoothedCursor;
}

function buildSizeTimeline(
  beatmap: BeatmapData,
  modDiff: ModDifficulty,
  hitResults: readonly HitResult[],
): Segment[] {
  const segments: Segment[] = [];
  const hos = beatmap.hitObjects;
  if (hos.length === 0) return segments;

  const mapStart = hos[0]!.time;
  const lastObj  = hos[hos.length - 1]!;
  const lastEnd  = 'endTime' in lastObj ? (lastObj as { endTime: number }).endTime : lastObj.time;
  const mapEndAt = lastEnd + modDiff.hitWindow50 + 5;

  addTimelineEvent(segments, INTRO_START_SIZE,
    mapStart - FL_DURATION_MS, DEFAULT_FL_SIZE, FL_DURATION_MS, 'outQuad');

  type Evt =
    | { kind: 'combo'; t: number; combo: number }
    | { kind: 'breakStart'; t: number }
    | { kind: 'breakEndPrep'; t: number };

  const events: Evt[] = [];
  const comboFrames = computeComboTimeline(hitResults);
  for (const cf of comboFrames) events.push({ kind: 'combo', t: cf.time, combo: cf.combo });
  for (const b of beatmap.breaks) {
    if (b.endTime - b.startTime > BREAK_MIN_DURATION) {
      events.push({ kind: 'breakStart',   t: b.startTime });
      events.push({ kind: 'breakEndPrep', t: b.endTime - FL_DURATION_MS });
    }
  }
  // Combo events sort before break events at equal times so break restore uses the latest tier.
  events.sort((a, b) => {
    if (a.t !== b.t) return a.t - b.t;
    const rank = (k: Evt['kind']): number =>
      k === 'combo' ? 0 : k === 'breakStart' ? 1 : 2;
    return rank(a.kind) - rank(b.kind);
  });

  let comboTarget = DEFAULT_FL_SIZE;
  for (const e of events) {
    if (e.kind === 'combo') {
      const target = tierSize(e.combo);
      if (target !== comboTarget) {
        comboTarget = target;
        addTimelineEvent(segments, INTRO_START_SIZE,
          e.t, target, FL_DURATION_MS, 'outQuad');
      }
    } else if (e.kind === 'breakStart') {
      addTimelineEvent(segments, INTRO_START_SIZE,
        e.t, BREAK_SIZE, FL_DURATION_MS, 'outQuad');
    } else {
      addTimelineEvent(segments, INTRO_START_SIZE,
        e.t, comboTarget, FL_DURATION_MS, 'outQuad');
    }
  }

  addTimelineEvent(segments, INTRO_START_SIZE,
    mapEndAt, INTRO_START_SIZE, FL_DURATION_MS, 'outQuad');

  return segments;
}

function buildDimTimeline(
  trackingIntervals: readonly { start: number; end: number }[],
): Segment[] {
  const segments: Segment[] = [];
  for (const iv of trackingIntervals) {
    addTimelineEvent(segments, 0, iv.start, SLIDER_DIM, DIM_TRANSITION_MS, 'linear');
    addTimelineEvent(segments, 0, iv.end,   0,          DIM_TRANSITION_MS, 'linear');
  }
  return segments;
}

/**
 * osu!std Flashlight-mod overlay, following stable/danser behaviour: a soft-edged beam
 * (radius in osu!pixels: 168 base, shrinking at 100/200 combo, widening during breaks and
 * the intro/outro) that trails the cursor with a 120 ms eased delay, plus extra dimming
 * while a slider is being tracked. Everything time-dependent is precomputed at construction;
 * `draw` is a cheap per-frame composite. `trackingIntervals` are (start, end) map-time ms
 * ranges during which the player tracked a slider.
 */
export class Flashlight {
  private readonly timelines: FlashlightTimelines;
  private readonly falloff: OffscreenCanvas;
  private readonly buffer: OffscreenCanvas;
  private readonly bctx: OffscreenCanvasRenderingContext2D;

  constructor(
    beatmap: BeatmapData,
    replay: ReplayData,
    modDiff: ModDifficulty,
    hitResults: readonly HitResult[],
    trackingIntervals: readonly { start: number; end: number }[],
    qualityTotal: number = 1,
  ) {
    this.timelines = {
      sizeSegments: buildSizeTimeline(beatmap, modDiff, hitResults),
      dimSegments:  buildDimTimeline(trackingIntervals),
      smoothed:     buildSmoothedCursor(replay),
    };
    this.falloff = getFalloffBitmap();
    // Physical-sized buffer keeps falloff crisp on HiDPI; bctx is pre-scaled to logical coords.
    this.buffer  = new OffscreenCanvas(CANVAS_W * qualityTotal, CANVAS_H * qualityTotal);
    const bctx = this.buffer.getContext('2d');
    if (bctx === null) throw new Error('Flashlight: failed to get 2D context on buffer canvas');
    bctx.scale(qualityTotal, qualityTotal);
    this.bctx = bctx;
  }

  /** Composite the darkness-with-beam overlay onto `ctx` (logical 1280×720 coords) for the
   * given beatmap time. Call after gameplay is drawn, before HUD layers. */
  draw(ctx: CanvasRenderingContext2D, timeMs: number): void {
    const size = evaluateSegments(this.timelines.sizeSegments, timeMs, INTRO_START_SIZE);
    const dim  = evaluateSegments(this.timelines.dimSegments,  timeMs, 0);
    const pos  = smoothedAt(this.timelines.smoothed, timeMs);

    // HR-aware draw: the raw replay cursor is already in the played-orientation
    // coordinate space (the player actually moved there), so no y-flip here.
    const cx = OFFSET_X + pos.x * SCALE;
    const cy = OFFSET_Y + pos.y * SCALE;
    const d  = size * SCALE * 2;

    const bctx = this.bctx;

    bctx.globalCompositeOperation = 'source-over';
    bctx.globalAlpha = 1;
    bctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    bctx.fillStyle = `rgba(0, 0, 0, ${MAX_DIM})`;
    bctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Effective eraser = (1 - (r/R)^5) * (1 - dim) via falloff alpha × globalAlpha.
    bctx.globalCompositeOperation = 'destination-out';
    bctx.globalAlpha = 1 - dim;
    bctx.drawImage(this.falloff, cx - d / 2, cy - d / 2, d, d);

    bctx.globalCompositeOperation = 'source-over';
    bctx.globalAlpha = 1;

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    // Buffer is physical-sized; explicit dest size lands it at logical 1280×720.
    ctx.drawImage(this.buffer, 0, 0, CANVAS_W, CANVAS_H);
    ctx.restore();
  }
}
