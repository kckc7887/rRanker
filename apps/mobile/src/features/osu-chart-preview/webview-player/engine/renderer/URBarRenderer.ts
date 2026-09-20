/*
 * Portions derived from https://github.com/Wieku/danser-go
 * Copyright (c) 2018-2024 Sebastian Krajewski.
 * Those portions remain under GPL-3.0; see LICENSES/danser-go-GPL-3.0.txt.
 * Included in rRanker under its AGPL-3.0 application license.
 * Changed by rRanker on 2026-09-19 for chart preview integration.
 */
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
import type { BeatmapData, HitResult } from '../types/index';
import type { ModDifficulty } from '../utils/modDifficulty';
import type { TaikoHitObject } from '../rulesets/taiko/types';
import type { ManiaHitObject } from '../rulesets/mania/types';

const CANVAS_W = 1280;
const CANVAS_H = 720;

// danser-go hiterror.go port.
const ERROR_BASE        = 4.8;
const BASE_SCALE        = 0.8;       // px per ms
const SCALE             = 1;
const POINT_FADE_OUT_MS = 10000;
const TICK_BASE_ALPHA   = 0.4;
const TRIANGLE_EASE_MS  = 800;
const WIDGET_HOLD_MS    = 4000;
const WIDGET_FADE_MS    = 1000;

const COLOR_300 = 'rgb(51, 204, 255)';
const COLOR_100 = 'rgb(112, 250, 46)';
const COLOR_50  = 'rgb(217, 173, 69)';

// Mania has five colored windows (Perfect/Great/Good/Ok/Meh). Perfect/Good/Ok reuse the
// std palette (blue/green/gold) for visual coherence; Great/Meh fill the gaps. Miss is the
// uncolored bar edge, matching lazer's BarHitErrorMeter (only hit windows get a zone).
const COLOR_MANIA_PERFECT = 'rgb(51, 204, 255)';
const COLOR_MANIA_GREAT   = 'rgb(0, 230, 150)';
const COLOR_MANIA_GOOD    = 'rgb(112, 250, 46)';
const COLOR_MANIA_OK      = 'rgb(217, 173, 69)';
const COLOR_MANIA_MEH     = 'rgb(229, 110, 90)';

// TailNote.cs RELEASE_WINDOW_LENIENCE — lazer judges and plots the tail release offset
// divided by 1.5 (mirrors hitJudge.ts's RELEASE_LENIENCE).
const RELEASE_LENIENCE = 1.5;

const CX = CANVAS_W / 2;
const CY = CANVAS_H - 14;

/** One tick on the hit-error bar. `errorPx` is the signed hit error pre-converted to
 * bar pixels (errorMs × 0.8); `time` is when the hit landed (beatmap ms). */
export interface URHit {
  time: number;
  errorPx: number;
  color: string;
  // EMA target after this hit lands.
  emaPx: number;
  // Triangle X (px from CX) at the instant this hit landed.
  triangleStartPx: number;
}

/**
 * One colored hit-window band. Zones are drawn inner→outer; each fills
 * [prevWindow, window] on both sides of centre. std/taiko supply three
 * (300/100/50 · great/ok/miss); mania supplies five.
 */
export interface URZone {
  color: string;
  window: number;   // outer edge of this zone, ms (half-width)
}

/** Precomputed hit-error-bar data: all ticks plus the ruleset's window zones.
 * Built once per session and consumed by {@link drawURBar} every frame. */
export interface URTimeline {
  hits: URHit[];
  zones: URZone[];
}

// ─── Build the timeline (called once in Renderer constructor) ────────────────

// Shared EMA + triangle-easing pass over pre-filtered, pre-colored hit errors.
function buildHits(raw: { time: number; errorMs: number; color: string }[]): URHit[] {
  raw.sort((a, b) => a.time - b.time);

  const hits: URHit[] = [];
  let emaPx = 0;
  let lastTriX = 0;
  let lastEmaPx = 0;
  let lastTime = 0;
  let n = 0;

  for (const e of raw) {
    const errorPx = e.errorMs * BASE_SCALE;

    let triangleStartPx: number;
    if (n === 0) {
      triangleStartPx = 0;
    } else {
      const dt = e.time - lastTime;
      if (dt >= TRIANGLE_EASE_MS) {
        triangleStartPx = lastEmaPx;
      } else {
        const t = dt / TRIANGLE_EASE_MS;
        const eased = t * (2 - t);
        triangleStartPx = lastTriX + (lastEmaPx - lastTriX) * eased;
      }
    }

    emaPx = emaPx * 0.8 + errorPx * 0.2;

    hits.push({ time: e.time, errorPx, color: e.color, emaPx, triangleStartPx });

    n++;
    lastTriX  = triangleStartPx;
    lastEmaPx = emaPx;
    lastTime  = e.time;
  }

  return hits;
}

/** Build the osu!std hit-error timeline: per-circle/slider-head press offsets colored by
 * the mod-adjusted 300/100/50 windows. Spinners and slider sub-results are excluded. */
export function computeURTimeline(
  results: readonly HitResult[],
  beatmap: BeatmapData,
  modDiff: ModDifficulty,
): URTimeline {
  const w300 = modDiff.hitWindow300;
  const w100 = modDiff.hitWindow100;
  const w50  = modDiff.hitWindow50;

  // |error| < w50 strictly excludes auto-misses (synthetic time = startTime + w50, |err| === w50).
  const raw: { time: number; errorMs: number; color: string }[] = [];
  for (const r of results) {
    if (r.isSliderSub) continue;
    const obj = beatmap.hitObjects[r.objectIndex];
    if (obj === undefined || obj.type === 'spinner') continue;
    const errorMs = r.time - obj.time;
    const absMs = Math.abs(errorMs);
    if (absMs >= w50) continue;
    const color = absMs < w300 ? COLOR_300 : (absMs < w100 ? COLOR_100 : COLOR_50);
    raw.push({ time: r.time, errorMs, color });
  }

  const zones: URZone[] = [
    { color: COLOR_300, window: w300 },
    { color: COLOR_100, window: w100 },
    { color: COLOR_50,  window: w50  },
  ];
  return { hits: buildHits(raw), zones };
}

/**
 * Build the taiko hit-error timeline. `objectIndex` points into source beatmap.hitObjects
 * (not the converted taiko array); a single slider converts to multiple hits sharing the
 * index. Walks both arrays in lockstep — the taiko judgement pass emits exactly one
 * non-comboIgnore result per kind:'hit' object.
 */
export function computeTaikoURTimeline(
  objects: readonly TaikoHitObject[],
  results: readonly HitResult[],
  modDiff: ModDifficulty,
): URTimeline {
  const greatW = modDiff.taikoHitWindowGreat;
  const okW    = modDiff.taikoHitWindowOk;
  const missW  = modDiff.taikoHitWindowMiss;

  const hitSequence: { sourceIndex: number; time: number }[] = [];
  for (const o of objects) {
    if (o.kind === 'hit') hitSequence.push({ sourceIndex: o.sourceIndex, time: o.time });
  }

  const raw: { time: number; errorMs: number; color: string }[] = [];
  let hi = 0;
  for (const r of results) {
    if (r.comboIgnore) continue;
    const h = hitSequence[hi];
    if (h === undefined) break;
    hi++;
    const errorMs = r.time - h.time;
    const absMs = Math.abs(errorMs);
    if (absMs >= missW) continue;
    const color = absMs < greatW ? COLOR_300 : (absMs < okW ? COLOR_100 : COLOR_50);
    raw.push({ time: r.time, errorMs, color });
  }

  const zones: URZone[] = [
    { color: COLOR_300, window: greatW },
    { color: COLOR_100, window: okW    },
    { color: COLOR_50,  window: missW  },
  ];
  return { hits: buildHits(raw), zones };
}

/**
 * Build the mania hit-error timeline. Tap notes + HoldNote heads contribute their press
 * offset; tails contribute the release offset divided by 1.5 (RELEASE_LENIENCE), matching
 * lazer's AffectsUnstableRate (IsHit only) + the tail window leniency. Bodies have no
 * timing. `objectIndex` is a mania sourceIndex (holds live past beatmap.hitObjects.length),
 * so target times come from `objects`.
 */
export function computeManiaURTimeline(
  objects: readonly ManiaHitObject[],
  results: readonly HitResult[],
  modDiff: ModDifficulty,
): URTimeline {
  const objBySource = new Map<number, ManiaHitObject>();
  for (const o of objects) objBySource.set(o.sourceIndex, o);

  const colorFor = (j: number): string =>
    j === 305 ? COLOR_MANIA_PERFECT :
    j === 300 ? COLOR_MANIA_GREAT   :
    j === 200 ? COLOR_MANIA_GOOD    :
    j === 100 ? COLOR_MANIA_OK      : COLOR_MANIA_MEH;

  const raw: { time: number; errorMs: number; color: string }[] = [];
  for (const r of results) {
    if (r.judgement === 0) continue;       // misses (incl. auto-miss) excluded — lazer IsHit gate
    if (r.subResult === 'body') continue;  // body tracks hold-breaks, no timing
    const o = objBySource.get(r.objectIndex);
    if (o === undefined) continue;

    let errorMs: number;
    if (o.kind === 'note') {
      errorMs = r.time - o.time;
    } else if (r.subResult === 'tail') {
      errorMs = (r.time - o.endTime) / RELEASE_LENIENCE;
    } else { // head
      errorMs = r.time - o.startTime;
    }
    raw.push({ time: r.time, errorMs, color: colorFor(r.judgement) });
  }

  const zones: URZone[] = [
    { color: COLOR_MANIA_PERFECT, window: modDiff.maniaHitWindowPerfect },
    { color: COLOR_MANIA_GREAT,   window: modDiff.maniaHitWindowGreat   },
    { color: COLOR_MANIA_GOOD,    window: modDiff.maniaHitWindowGood    },
    { color: COLOR_MANIA_OK,      window: modDiff.maniaHitWindowOk      },
    { color: COLOR_MANIA_MEH,     window: modDiff.maniaHitWindowMeh     },
  ];
  return { hits: buildHits(raw), zones };
}

function findLatestHit(hits: readonly URHit[], timeMs: number): number {
  if (hits.length === 0 || timeMs < hits[0]!.time) return -1;
  if (timeMs >= hits[hits.length - 1]!.time) return hits.length - 1;
  let lo = 0, hi = hits.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (hits[mid]!.time <= timeMs) lo = mid; else hi = mid - 1;
  }
  return lo;
}

/**
 * Draw the hit-error bar (bottom-centre): colored window zones, fading tick per hit,
 * and an eased triangle tracking the error EMA. The whole widget holds for 4 s after
 * the last hit then fades out. `ctx` is in logical 1280×720 coords.
 */
export function drawURBar(
  ctx: CanvasRenderingContext2D,
  timeline: URTimeline,
  timeMs: number,
): void {
  const i = findLatestHit(timeline.hits, timeMs);
  if (i < 0) return;

  const last = timeline.hits[i]!;
  const dt   = timeMs - last.time;

  let widgetAlpha: number;
  if (dt <= WIDGET_HOLD_MS) widgetAlpha = 1;
  else if (dt <= WIDGET_HOLD_MS + WIDGET_FADE_MS) {
    const t = (dt - WIDGET_HOLD_MS) / WIDGET_FADE_MS;
    widgetAlpha = 1 - t * t;
  } else widgetAlpha = 0;
  if (widgetAlpha <= 0.001) return;

  const stripH = ERROR_BASE * SCALE;
  const bgH    = ERROR_BASE * 4 * SCALE;
  const stripTop = CY - stripH / 2;
  const bgTop    = CY - bgH / 2;

  ctx.save();
  ctx.globalAlpha = widgetAlpha;

  // Nested colored windows, inner→outer; each fills [prevPx, endPx] on both sides.
  let prevPx = 0;
  for (const z of timeline.zones) {
    const endPx = z.window * BASE_SCALE;
    const w = (endPx - prevPx) * SCALE;
    ctx.fillStyle = z.color;
    ctx.fillRect(CX + prevPx * SCALE, stripTop, w, stripH);
    ctx.fillRect(CX - endPx  * SCALE, stripTop, w, stripH);
    prevPx = endPx;
  }

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(CX - 1, bgTop, 2, bgH);

  // Additive blend for tick dots.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let j = i; j >= 0; j--) {
    const h = timeline.hits[j]!;
    const age = timeMs - h.time;
    if (age >= POINT_FADE_OUT_MS) break;
    const fade = 1 - age / POINT_FADE_OUT_MS;
    ctx.globalAlpha = widgetAlpha * TICK_BASE_ALPHA * fade;
    ctx.fillStyle = h.color;
    ctx.fillRect(CX + h.errorPx * SCALE - 1.5, bgTop, 3, bgH);
  }
  ctx.restore();
  ctx.globalAlpha = widgetAlpha;

  let triPx: number;
  if (dt >= TRIANGLE_EASE_MS) {
    triPx = last.emaPx;
  } else {
    const t = dt / TRIANGLE_EASE_MS;
    const eased = t * (2 - t);
    triPx = last.triangleStartPx + (last.emaPx - last.triangleStartPx) * eased;
  }
  const triX = CX + triPx * SCALE;
  const triBaseY = CY - ERROR_BASE * 2.5 * SCALE;
  const triH = ERROR_BASE * 1.4 * SCALE;
  const triHalfW = triH * 0.7;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(triX, triBaseY);
  ctx.lineTo(triX - triHalfW, triBaseY - triH);
  ctx.lineTo(triX + triHalfW, triBaseY - triH);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}
