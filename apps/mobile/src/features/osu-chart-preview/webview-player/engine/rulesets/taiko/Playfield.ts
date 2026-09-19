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
import { taikoLookback, resolveTrackOpacity } from "../../../engine-performance";
import { drawFlatInputDrum } from "../../../flat-feedback";
import type { BeatmapData, TimingPoint, SkinAssets, HitResult } from '../../types/index';
import type { TaikoHit, TaikoDrumRoll, TaikoSwell, TaikoHitObject, TaikoSession, SwellProgress } from './types';
import type { TaikoAction, TaikoInputEvent } from './input';
import type { ComboFrame } from '../../renderer/HUDRenderer';
import type { ModDifficulty } from '../../utils/modDifficulty';
import type { RenderOptions } from '../../renderer/Renderer';
import { TaikoFlashlight } from './Flashlight';

// Taiko playfield rendering: scrolling lane, notes, drum rolls, swells, input
// drum, kiai glow, explosions and mascot. Geometry and the scroll model are
// ported from lazer's TaikoPlayfield / OverlappingScrollAlgorithm; sprite
// behaviour follows stable's legacy skin classes (LegacyCirclePiece,
// LegacyInputDrum, LegacySwell) where noted.

const LOGICAL_W = 1280;
const LOGICAL_H = 720;

const BASE_HEIGHT       = 200;
const INPUT_DRUM_WIDTH  = 180;
const HIT_TARGET_OFFSET = -24;
const HIT_TARGET_WIDTH  = BASE_HEIGHT;
const HIT_TARGET_CENTRE_PF = INPUT_DRUM_WIDTH + HIT_TARGET_WIDTH / 2 + HIT_TARGET_OFFSET; // 256

const DEFAULT_SIZE = 0.45;
const STRONG_SCALE = 1 / 0.65;

const VELOCITY_MULTIPLIER = 1.4;

const PLAYFIELD_SCALE  = 1.0;
const PLAYFIELD_H_PX   = BASE_HEIGHT * PLAYFIELD_SCALE;
const PLAYFIELD_TOP_Y  = (LOGICAL_H - PLAYFIELD_H_PX) / 2; // 260
const LANE_CENTRE_Y    = PLAYFIELD_TOP_Y + PLAYFIELD_H_PX / 2;
const INPUT_DRUM_W_PX  = INPUT_DRUM_WIDTH * PLAYFIELD_SCALE;
const HIT_TARGET_X     = HIT_TARGET_CENTRE_PF * PLAYFIELD_SCALE;
const LANE_LEFT_X      = INPUT_DRUM_W_PX;
const LANE_RIGHT_X     = LOGICAL_W;

const NOTE_RADIUS_PX        = (DEFAULT_SIZE * BASE_HEIGHT * PLAYFIELD_SCALE) / 2;
const STRONG_NOTE_RADIUS_PX = NOTE_RADIUS_PX * STRONG_SCALE;

/** Canvas x of the hit-target centre (1280×720 logical px); judgements/explosions anchor here. */
export const HIT_TARGET_CANVAS_X = HIT_TARGET_X;
/** Canvas y of the lane centre (1280×720 logical px). */
export const HIT_TARGET_CANVAS_Y = LANE_CENTRE_Y;

const DRUM_FLASH_MS = 60;

const DON_COLOUR      = 'rgb(235, 69, 44)';
const KAT_COLOUR      = 'rgb(68, 141, 171)';


// Drumroll tint: idle YellowDark → engaged YellowDarker; 100ms fade per transition (lazer colours).
const DRUMROLL_IDLE_RGB        = { r: 238, g: 170, b:   0 } as const;
const DRUMROLL_ENGAGED_RGB     = { r: 204, g: 102, b:   0 } as const;
const DRUMROLL_TICKS_TO_ENGAGE = 5;
const DRUMROLL_FADE_MS         = 100;

function skinImg(images: Map<string, ImageBitmap>, stem: string): ImageBitmap | undefined {
  return images.get(`${stem}@2x.png`) ?? images.get(`${stem}.png`);
}

// Lazer treats `Version: latest` as the newest legacy version and an unspecified version as 1.0.


// Multiplicative tint: draw → multiply-fill → destination-in mask. Per-bitmap × per-color, GC-safe.
const _tintCache = new WeakMap<ImageBitmap, Map<string, OffscreenCanvas>>();
function tintBitmap(bitmap: ImageBitmap, color: string): OffscreenCanvas {
  let colorMap = _tintCache.get(bitmap);
  if (colorMap === undefined) {
    colorMap = new Map();
    _tintCache.set(bitmap, colorMap);
  }
  const cached = colorMap.get(color);
  if (cached !== undefined) return cached;
  const { width: w, height: h } = bitmap;
  const osc = new OffscreenCanvas(w, h);
  const oc = osc.getContext('2d')!;
  oc.drawImage(bitmap, 0, 0);
  oc.globalCompositeOperation = 'multiply';
  oc.fillStyle = color;
  oc.fillRect(0, 0, w, h);
  oc.globalCompositeOperation = 'destination-in';
  oc.drawImage(bitmap, 0, 0);
  colorMap.set(color, osc);
  return osc;
}

function drawCentredBitmap(
  ctx: CanvasRenderingContext2D,
  bitmap: ImageBitmap | OffscreenCanvas,
  cx: number,
  cy: number,
  d: number,
): void {
  // Preserve aspect (@2x assets can be slightly off-square).
  const aspect = bitmap.width / bitmap.height;
  const drawW = aspect >= 1 ? d : d * aspect;
  const drawH = aspect >= 1 ? d / aspect : d;
  ctx.drawImage(bitmap, cx - drawW / 2, cy - drawH / 2, drawW, drawH);
}

// Logical (½-for-@2x) longer side of a base note sprite. The base (taiko[big]circle) is drawn
// so its full texture spans the note's display diameter `d`, i.e. display-px per logical-px = d / this.
function baseLogicalExtent(images: Map<string, ImageBitmap>, stem: string, bitmap: ImageBitmap): number {
  const pixelScale = images.has(`${stem}@2x.png`) ? 0.5 : 1;
  return Math.max(bitmap.width, bitmap.height) * pixelScale;
}

// Draw a circle overlay (taiko[big]circleoverlay) the way osu!stable's LegacyCirclePiece does:
// centred at the SAME per-pixel scale as the base sprite, at the overlay's own native dimensions —
// NOT squashed into the base's square box. A tall overlay (a normal-sized circle plus a "this note
// is big" arrow extending well above it) therefore keeps its proportions, so the circle lands on the
// note at normal size and the arrow pokes up toward the top of the playfield. For a square overlay
// matching the base this is identical to drawCentredBitmap(…, d).
function drawOverlayNative(
  ctx: CanvasRenderingContext2D,
  bitmap: ImageBitmap,
  pixelScale: number,
  cx: number,
  cy: number,
  baseLogicalMax: number,
  d: number,
): void {
  const s = d / baseLogicalMax;
  const w = bitmap.width * pixelScale * s;
  const h = bitmap.height * pixelScale * s;
  ctx.drawImage(bitmap, cx - w / 2, cy - h / 2, w, h);
}

function getTimingAt(tps: readonly TimingPoint[], time: number): {
  baseBeatLength: number; svMultiplier: number; meter: number; kiai: boolean;
} {
  let baseBeatLength = 500;
  let svMultiplier   = 1;
  let meter          = 4;
  let kiai           = false;
  for (const tp of tps) {
    if (tp.time > time) break;
    if (!tp.inherited) {
      baseBeatLength = tp.beatLength;
      svMultiplier   = 1;
      meter          = tp.meter;
    } else {
      svMultiplier = Math.max(0.1, Math.min(10, -100 / tp.beatLength));
    }
    kiai = tp.kiai;
  }
  return { baseBeatLength, svMultiplier, meter, kiai };
}

// Scroll calibration, ported faithfully from lazer's OverlappingScrollAlgorithm +
// TaikoPlayfieldAdjustmentContainer:
//   on-screen velocity = Multiplier × scrollLength / timeRange
//   Multiplier         = SliderMultiplier × scrollSpeed × DEFAULT_BEAT_LENGTH / localBeatLength
// taiko is RelativeScaleBeatLengths=false, so BaseBeatLength is the fixed DEFAULT_BEAT_LENGTH (not the
// most-common beat length); scroll therefore scales with the local BPM (1/localBeatLength), as in stable.
const DEFAULT_BEAT_LENGTH = 1000;   // TimingControlPoint.DEFAULT_BEAT_LENGTH
const TAIKO_MIN_ASPECT = 5 / 4;     // TaikoPlayfieldAdjustmentContainer.MINIMUM_ASPECT
const TAIKO_MAX_ASPECT = 16 / 9;    //                                  .MAXIMUM_ASPECT
const STABLE_GAMEFIELD_HEIGHT = 480;
const STABLE_HIT_LOCATION = 160;

// Port of TaikoPlayfieldAdjustmentContainer.ComputeTimeRange(): visible time (ms) for a Multiplier-1 note.
// Aspect-only (no BPM term — taiko uses the Overlapping algorithm), with aspect clamped to taiko's locked
// range. Our canvas is fixed 16:9, which is exactly MAXIMUM_ASPECT, so this evaluates to ~4952 ms.
function computeTaikoTimeRange(): number {
  const aspect = Math.max(TAIKO_MIN_ASPECT, Math.min(TAIKO_MAX_ASPECT, LOGICAL_W / LOGICAL_H));
  const inLength = aspect * STABLE_GAMEFIELD_HEIGHT - STABLE_HIT_LOCATION;
  return (inLength / 100) * 1000 / VELOCITY_MULTIPLIER;
}

const TAIKO_TIME_RANGE_MS = computeTaikoTimeRange();

/**
 * Scroll velocity (logical px per ms) for an object starting at `time`, from
 * the beatmap's active timing point. `smFactor` is the HR/EZ scroll scaling
 * from {@link taikoScrollMultiplier}; `isConstantSpeed` ignores inherited SV
 * (the ConstantSpeed mod's behaviour).
 */
export function scrollVelocityAt(
  beatmap: BeatmapData,
  time: number,
  isConstantSpeed: boolean,
  smFactor: number = 1,
): number {
  const { baseBeatLength, svMultiplier } = getTimingAt(beatmap.timingPoints, time);
  const scrollSpeed = isConstantSpeed ? 1 : svMultiplier;
  if (baseBeatLength <= 0) return 0;
  // lazer: Multiplier × scrollLength (= LANE_WIDTH_PX) / timeRange.
  const multiplier = (beatmap.sliderMultiplier * smFactor * scrollSpeed * DEFAULT_BEAT_LENGTH) / baseBeatLength;
  return (multiplier * LANE_WIDTH_PX) / TAIKO_TIME_RANGE_MS;
}

/**
 * HR/EZ scroll-speed factor applied post-conversion (TaikoModHardRock scales
 * scrolling, not rhythm). The extra 4/3 is lazer's 16:9-playfield constant,
 * which matches our fixed canvas aspect.
 */
export function taikoScrollMultiplier(modDiff: ModDifficulty): number {
  if (modDiff.isHR) return 1.4 * 4 / 3;
  if (modDiff.isEZ) return 0.8;
  return 1;
}

/** Scrollable lane width (hit target → right edge, logical px); a note's on-screen lifetime is LANE_WIDTH_PX / velocity. */
export const LANE_WIDTH_PX = LANE_RIGHT_X - HIT_TARGET_X;

// Hidden: fade starts at spawn, completes after 37.5% of travel. Hits only — drumroll body and swells exempt.
const TAIKO_HD_FADE_START = 1.0;
const TAIKO_HD_FADE_DURATION = 0.375;

function taikoHiddenAlpha(hitTime: number, timeMs: number, scrollVel: number): number {
  if (scrollVel <= 0) return 1;
  const preempt = LANE_WIDTH_PX / scrollVel;
  const age = hitTime - timeMs;
  if (age >= preempt * TAIKO_HD_FADE_START) return 1;
  const fadeEndAge = preempt * (TAIKO_HD_FADE_START - TAIKO_HD_FADE_DURATION);
  if (age <= fadeEndAge) return 0;
  return (age - fadeEndAge) / (preempt * TAIKO_HD_FADE_DURATION);
}

/**
 * Bar-line times (ms): one line per measure (meter × beatLength) from each
 * uninherited timing point until the next, extending 5 s past the last object.
 * Pre-computed once per session; render walks a binary-searched slice.
 */
export function computeBarLineTimes(beatmap: BeatmapData): number[] {
  const uninherited: TimingPoint[] = [];
  for (const tp of beatmap.timingPoints) if (!tp.inherited) uninherited.push(tp);
  if (uninherited.length === 0) return [];

  let endTime = 0;
  for (const obj of beatmap.hitObjects) {
    const t = obj.type === 'spinner' ? obj.endTime : obj.time;
    if (t > endTime) endTime = t;
  }
  endTime += 5000;

  const lines: number[] = [];
  const MAX_LINES = 200000;
  for (let i = 0; i < uninherited.length; i++) {
    const tp = uninherited[i]!;
    const nextStart = i + 1 < uninherited.length ? uninherited[i + 1]!.time : endTime;
    const step = Math.max(1, tp.meter * tp.beatLength);
    for (let t = tp.time; t < nextStart; t += step) {
      lines.push(t);
      if (lines.length >= MAX_LINES) return lines;
    }
  }
  return lines;
}

function endTimeOf(o: TaikoHitObject): number {
  return o.kind === 'hit' ? o.time : o.endTime;
}

function findObjectVisibleRange(
  objects: readonly TaikoHitObject[],
  timeMs: number,
  scrollMs: number,
  lookbackMs: number,
): { firstIdx: number; lastIdx: number } {
  const n = objects.length;
  if (n === 0) return { firstIdx: 0, lastIdx: -1 };
  const minTime = timeMs - lookbackMs;
  const maxTime = timeMs + scrollMs;

  // firstIdx: smallest i with endTimeOf(objects[i]) >= minTime.
  let lo = 0, hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (endTimeOf(objects[mid]!) < minTime) lo = mid + 1;
    else hi = mid;
  }
  const firstIdx = lo;
  if (firstIdx >= n || objects[firstIdx]!.time > maxTime) {
    return { firstIdx, lastIdx: firstIdx - 1 };
  }
  // lastIdx: largest i with objects[i].time <= maxTime.
  lo = firstIdx; hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    if (objects[mid]!.time <= maxTime) lo = mid;
    else hi = mid - 1;
  }
  return { firstIdx, lastIdx: lo };
}

function findTimeRange(times: readonly number[], minTime: number, maxTime: number): { firstIdx: number; lastIdx: number } {
  const n = times.length;
  if (n === 0) return { firstIdx: 0, lastIdx: -1 };
  let lo = 0, hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (times[mid]! < minTime) lo = mid + 1; else hi = mid;
  }
  const firstIdx = lo;
  if (firstIdx >= n || times[firstIdx]! > maxTime) {
    return { firstIdx, lastIdx: firstIdx - 1 };
  }
  lo = firstIdx; hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    if (times[mid]! <= maxTime) lo = mid; else hi = mid - 1;
  }
  return { firstIdx, lastIdx: lo };
}

function objectX(objectTime: number, timeMs: number, scrollVel: number): number {
  return HIT_TARGET_X + (objectTime - timeMs) * scrollVel;
}

// Equal-rate fade for taiko-bar-right-glow (unlike taiko-glow which has asymmetric rates).
const BAR_GLOW_FADE_PER_MS = 1 / 200;

function drawPlayfieldBackground(
  ctx: CanvasRenderingContext2D,
  skin: SkinAssets | undefined,
  timingPoints: readonly TimingPoint[],
  timeMs: number,
  trackOpacity = 1,
): void {
  ctx.save();
  ctx.globalAlpha *= trackOpacity;
  const barRight     = skin ? skinImg(skin.images, 'taiko-bar-right')      : undefined;
  const barRightGlow = skin ? skinImg(skin.images, 'taiko-bar-right-glow') : undefined;
  const barLeft      = skin ? skinImg(skin.images, 'taiko-bar-left')       : undefined;

  // bar-right covers the entire playfield (including behind the drum); bar-left layers on top.
  if (barRight !== undefined) {
    ctx.drawImage(barRight, 0, PLAYFIELD_TOP_Y, LANE_RIGHT_X, PLAYFIELD_H_PX);
    if (barRightGlow !== undefined) {
      const { transitionTime, kiaiOn } = lastKiaiTransitionAt(timingPoints, timeMs);
      let alpha = 0;
      if (isFinite(transitionTime)) {
        const elapsed = timeMs - transitionTime;
        alpha = kiaiOn
          ? Math.min(1, elapsed * BAR_GLOW_FADE_PER_MS)
          : Math.max(0, 1 - elapsed * BAR_GLOW_FADE_PER_MS);
      }
      if (alpha > 0) {
        ctx.save();
        ctx.globalAlpha *= alpha;
        ctx.drawImage(barRightGlow, 0, PLAYFIELD_TOP_Y, LANE_RIGHT_X, PLAYFIELD_H_PX);
        ctx.restore();
      }
    }
  } else {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(LANE_LEFT_X, PLAYFIELD_TOP_Y, LANE_RIGHT_X - LANE_LEFT_X, PLAYFIELD_H_PX);
  }

  ctx.restore();

  // bar-left (native 181×200) sits on top of bar-right at the drum's right edge.
  if (barLeft !== undefined) {
    ctx.drawImage(barLeft, 0, PLAYFIELD_TOP_Y, INPUT_DRUM_W_PX, PLAYFIELD_H_PX);
  } else {
    ctx.fillStyle = '#1b1b1b';
    ctx.fillRect(0, PLAYFIELD_TOP_Y, INPUT_DRUM_W_PX, PLAYFIELD_H_PX);
  }

  if (barRight === undefined) {
    ctx.save();
    ctx.globalAlpha *= trackOpacity;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, PLAYFIELD_TOP_Y);                 ctx.lineTo(LOGICAL_W, PLAYFIELD_TOP_Y);
    ctx.moveTo(0, PLAYFIELD_TOP_Y + PLAYFIELD_H_PX); ctx.lineTo(LOGICAL_W, PLAYFIELD_TOP_Y + PLAYFIELD_H_PX);
    ctx.stroke();
    ctx.restore();
  }
}

// Sprites render at texture's natural size × scale (NOT fit to hit-target column).
const HIT_TARGET_BIG_SCALE      = 0.8;
const HIT_TARGET_APPROACH_SCALE = 0.83;
const HIT_TARGET_BIG_ALPHA      = 0.22;
const HIT_TARGET_APPROACH_ALPHA = 0.47;

function drawHitTarget(ctx: CanvasRenderingContext2D, skin: SkinAssets | undefined): void {
  if (skin === undefined) return;
  const big      = skinSpriteNatural(skin.images, 'taikobigcircle');
  if (big === undefined) return;
  const approach = skinSpriteNatural(skin.images, 'approachcircle');

  ctx.save();
  if (approach !== undefined) {
    ctx.globalAlpha = HIT_TARGET_APPROACH_ALPHA;
    drawSpriteNatural(ctx, approach, HIT_TARGET_X, LANE_CENTRE_Y, HIT_TARGET_APPROACH_SCALE);
  }
  ctx.globalAlpha = HIT_TARGET_BIG_ALPHA;
  drawSpriteNatural(ctx, big, HIT_TARGET_X, LANE_CENTRE_Y, HIT_TARGET_BIG_SCALE);
  ctx.restore();
}

function drawBarLines(
  ctx: CanvasRenderingContext2D,
  times: readonly number[],
  vels: readonly number[],
  timeMs: number,
  maxScrollMs: number,
  lookbackMs: number,
  skin: SkinAssets | undefined,
): void {
  // Conservative bracket; per-line pixel check below culls fast-velocity lines not yet entered.
  const { firstIdx, lastIdx } = findTimeRange(times, timeMs - lookbackMs, timeMs + maxScrollMs);
  if (lastIdx < firstIdx) return;

  const barlineSprite = skin ? skinImg(skin.images, 'taiko-barline') : undefined;
  if (barlineSprite !== undefined) {
    const aspect = barlineSprite.width / barlineSprite.height;
    const drawH  = PLAYFIELD_H_PX;
    const drawW  = drawH * aspect;
    const yTop   = PLAYFIELD_TOP_Y;
    for (let i = firstIdx; i <= lastIdx; i++) {
      const x = HIT_TARGET_X + (times[i]! - timeMs) * vels[i]!;
      if (x < LANE_LEFT_X || x > LANE_RIGHT_X) continue;
      ctx.drawImage(barlineSprite, x - drawW / 2, yTop, drawW, drawH);
    }
    return;
  }

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.13)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = firstIdx; i <= lastIdx; i++) {
    const x = HIT_TARGET_X + (times[i]! - timeMs) * vels[i]!;
    if (x < LANE_LEFT_X || x > LANE_RIGHT_X) continue;
    ctx.moveTo(x, PLAYFIELD_TOP_Y);
    ctx.lineTo(x, PLAYFIELD_TOP_Y + PLAYFIELD_H_PX);
  }
  ctx.stroke();
}

// combo<50 → hold; 50–149 → swap per beat; ≥150 → per half-beat. Phase from active red line.
function bpmPacedOverlayFrame(
  combo: number,
  timeMs: number,
  timingPointTime: number,
  beatLength: number,
  frameCount: number,
): number {
  if (frameCount <= 1) return 0;
  let multiplier: number;
  if (combo >= 150)     multiplier = 2;
  else if (combo >= 50) multiplier = 1;
  else                  return 0;
  if (beatLength <= 0) return 0;
  const period = (beatLength * 2) / multiplier;
  const half   =  beatLength      / multiplier;
  const phase  = Math.abs(timeMs - timingPointTime) % period;
  return phase >= half ? 0 : 1;
}

function getUninheritedAt(tps: readonly TimingPoint[], time: number): { time: number; beatLength: number } {
  let out = { time: 0, beatLength: 500 };
  for (const tp of tps) {
    if (tp.time > time) break;
    if (!tp.inherited) out = { time: tp.time, beatLength: tp.beatLength };
  }
  return out;
}

function comboAt(comboFrames: readonly ComboFrame[], timeMs: number): number {
  const n = comboFrames.length;
  if (n === 0) return 0;
  let lo = 0, hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (comboFrames[mid]!.time <= timeMs) lo = mid + 1;
    else hi = mid;
  }
  return lo > 0 ? comboFrames[lo - 1]!.combo : 0;
}

// `${stem}-${n}` numbered frames, or single unnumbered fallback. 1×1 → missing (placeholder convention).
function resolveSkinFrames(images: Map<string, ImageBitmap>, stem: string): SpriteWithScale[] {
  const frames: SpriteWithScale[] = [];
  for (let i = 0; ; i++) {
    const f = skinSpriteNatural(images, `${stem}-${i}`);
    if (f === undefined) break;
    frames.push(f);
  }
  if (frames.length > 0) return frames;
  const single = skinSpriteNatural(images, stem);
  return single !== undefined ? [single] : [];
}

// Flying-hit (lazer DrawableHit.UpdateHitStateTransforms): 900ms total, 800ms fade.







const MISS_FADE_MS            = 100;

// Y-arc is two stitched quadratics with discontinuous velocity at apex — don't smooth into one curve.


function drawHitCircle(
  ctx: CanvasRenderingContext2D,
  hit: TaikoHit,
  x: number,
  y: number,
  scaleFactor: number,
  alpha: number,
  timeMs: number,
  skin: SkinAssets | undefined,
  beatmap: BeatmapData,
  comboNow: number,
): void {
  const baseR = hit.isStrong ? STRONG_NOTE_RADIUS_PX : NOTE_RADIUS_PX;
  const r = baseR * scaleFactor;
  const colour = hit.isRim ? KAT_COLOUR : DON_COLOUR;
  // Tinted base sprite + untinted overlay, as in stable's LegacyCirclePiece; strong uses big variants.
  const baseStem    = hit.isStrong ? 'taikobigcircle'        : 'taikohitcircle';
  const overlayStem = hit.isStrong ? 'taikobigcircleoverlay' : 'taikohitcircleoverlay';
  const base = skin ? skinImg(skin.images, baseStem) : undefined;

  const prevAlpha = ctx.globalAlpha;
  if (alpha < 1) ctx.globalAlpha = prevAlpha * alpha;

  if (base !== undefined) {
    const d = r * 2;
    drawCentredBitmap(ctx, tintBitmap(base, colour), x, y, d);

    if (skin !== undefined) {
      const frames = resolveSkinFrames(skin.images, overlayStem);
      // Strong overlay falls back to the non-strong frames if the skin doesn't ship it.
      const overlayFrames = frames.length > 0
        ? frames
        : (hit.isStrong ? resolveSkinFrames(skin.images, 'taikohitcircleoverlay') : []);
      if (overlayFrames.length > 0) {
        let frameIdx = 0;
        if (overlayFrames.length > 1) {
          const tp = getUninheritedAt(beatmap.timingPoints, hit.time);
          frameIdx = bpmPacedOverlayFrame(comboNow, timeMs, tp.time, tp.beatLength, overlayFrames.length);
        }
        const baseLogicalMax = baseLogicalExtent(skin.images, baseStem, base);
        const f = overlayFrames[frameIdx]!;
        drawOverlayNative(ctx, f.bitmap, f.pixelScale, x, y, baseLogicalMax, d);
      }
    }
  } else {
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.92)';
    ctx.lineWidth = hit.isStrong ? 3 : 2;
    ctx.stroke();
  }

  if (alpha < 1) ctx.globalAlpha = prevAlpha;
}

function drawHit(
  ctx: CanvasRenderingContext2D,
  hit: TaikoHit,
  timeMs: number,
  scrollVel: number,
  skin: SkinAssets | undefined,
  judgmentByNote: ReadonlyMap<number, { time: number; judgement: number }>,
  beatmap: BeatmapData,
  comboNow: number,
  isHD: boolean,
): void {
  // Post-judgement branching:
  // miss → 100ms fade in place; hit → drawn by drawFlyingHits, the flying-hit pass.
  // Under HD the in-lane note already faded to 0 before the hit target, so nothing is drawn here;
  // the flying-hit animation itself still plays (see drawFlyingHits) — it ignores mods by design.
  const r = hit.isStrong ? STRONG_NOTE_RADIUS_PX : NOTE_RADIUS_PX;
  const judged = judgmentByNote.get(hit.noteId);
  if (judged !== undefined && timeMs >= judged.time) {
    if (isHD) return;
    if (judged.judgement === 0) {
      const age = timeMs - judged.time;
      if (age >= MISS_FADE_MS) return;
      const x = objectX(hit.time, timeMs, scrollVel);
      if (x < LANE_LEFT_X - r - 4 || x > LANE_RIGHT_X + r + 4) return;
      const alpha = 1 - age / MISS_FADE_MS;
      drawHitCircle(ctx, hit, x, LANE_CENTRE_Y, 1, alpha, timeMs, skin, beatmap, comboNow);
    }
    return;
  }
  const x = objectX(hit.time, timeMs, scrollVel);
  if (x < LANE_LEFT_X - r - 4 || x > LANE_RIGHT_X + r + 4) return;
  const alpha = isHD ? taikoHiddenAlpha(hit.time, timeMs, scrollVel) : 1;
  if (alpha <= 0) return;
  drawHitCircle(ctx, hit, x, LANE_CENTRE_Y, 1, alpha, timeMs, skin, beatmap, comboNow);
}

// Flying-hit pass (outside lane clip). X continues to scroll via objectX during the arc.
// Plays regardless of mods (incl. HD): the hit animation is a viewer-visible event even when the
// approaching note was faded out by HD — matching drawDrumRollFlyingHits, which never gated on HD.
function drawFlyingHits(
  ctx: CanvasRenderingContext2D,
  objects: readonly TaikoHitObject[],
  objectVel: readonly number[],
  firstIdx: number,
  lastIdx: number,
  timeMs: number,
  skin: SkinAssets | undefined,
  judgmentByNote: ReadonlyMap<number, { time: number; judgement: number }>,
  beatmap: BeatmapData,
  comboNow: number,
): void {
  // The built-in preview keeps feedback local; this legacy effect is disabled.
}

// Drum-roll tick hits spawn a flying note circle coloured by the pressed key (lazer's
// DrawableFlyingHit: centre→don, rim→kat). Same fly-off arc as a real hit, but no
// hit-target explosion or judgement text. Shown in HD too — the roll body stays visible.
function drawDrumRollFlyingHits(
  ctx: CanvasRenderingContext2D,
  objects: readonly TaikoHitObject[],
  objectVel: readonly number[],
  firstIdx: number,
  lastIdx: number,
  timeMs: number,
  skin: SkinAssets | undefined,
  hitResults: readonly HitResult[],
  beatmap: BeatmapData,
  comboNow: number,
): void {
  // The built-in preview keeps feedback local; this legacy effect is disabled.
}

// Per-replay tick-hit cache: results → (sourceIndex → tick hits). isRim records the pressed
// key (centre→don/0, rim→kat/8) so the flying-hit pass can colour each note like a real hit.
interface DrumrollTickHit { time: number; isRim: boolean; }
const _drumrollHitsByResults = new WeakMap<readonly HitResult[], Map<number, DrumrollTickHit[]>>();
const _EMPTY_DRUMROLL_HITS: readonly DrumrollTickHit[] = Object.freeze([]);
function drumrollTickHits(results: readonly HitResult[], sourceIndex: number): readonly DrumrollTickHit[] {
  let map = _drumrollHitsByResults.get(results);
  if (map === undefined) {
    map = new Map();
    for (const r of results) {
      if (!r.comboIgnore) continue;
      if (r.strong === true) continue;
      let arr = map.get(r.objectIndex);
      if (arr === undefined) { arr = []; map.set(r.objectIndex, arr); }
      arr.push({ time: r.time, isRim: (r.hitSound & 8) !== 0 });
    }
    _drumrollHitsByResults.set(results, map);
  }
  return map.get(sourceIndex) ?? _EMPTY_DRUMROLL_HITS;
}

// Walk ticks, greedily pair with presses; lerp between rolling levels over DRUMROLL_FADE_MS.
function computeDrumrollTint(
  roll: TaikoDrumRoll,
  results: readonly HitResult[],
  timeMs: number,
): string {
  const halfWin  = roll.tickInterval / 2;
  const tickHits = drumrollTickHits(results, roll.sourceIndex);

  let rolling    = 0;
  let prev       = 0;
  let lastChange = -Infinity;
  let hi         = 0;

  for (const tt of roll.tickTimes) {
    const deadline = tt + halfWin;
    while (hi < tickHits.length && tickHits[hi]!.time < tt - halfWin) hi++;
    let wasHit = false;
    let eventTime: number;
    if (hi < tickHits.length && tickHits[hi]!.time <= deadline) {
      wasHit    = true;
      eventTime = tickHits[hi]!.time;
      hi++;
    } else {
      eventTime = deadline;
    }
    if (eventTime > timeMs) break;
    const before = rolling;
    rolling = wasHit
      ? Math.min(DRUMROLL_TICKS_TO_ENGAGE, rolling + 1)
      : Math.max(0,                         rolling - 1);
    if (rolling !== before) {
      prev       = before;
      lastChange = eventTime;
    }
  }

  const fadeT = isFinite(lastChange)
    ? Math.max(0, Math.min(1, (timeMs - lastChange) / DRUMROLL_FADE_MS))
    : 1;
  const display = prev + (rolling - prev) * fadeT;
  const f       = display / DRUMROLL_TICKS_TO_ENGAGE;
  const r = Math.round(DRUMROLL_IDLE_RGB.r + (DRUMROLL_ENGAGED_RGB.r - DRUMROLL_IDLE_RGB.r) * f);
  const g = Math.round(DRUMROLL_IDLE_RGB.g + (DRUMROLL_ENGAGED_RGB.g - DRUMROLL_IDLE_RGB.g) * f);
  const b = Math.round(DRUMROLL_IDLE_RGB.b + (DRUMROLL_ENGAGED_RGB.b - DRUMROLL_IDLE_RGB.b) * f);
  return `rgb(${r}, ${g}, ${b})`;
}

function drawDrumRoll(
  ctx: CanvasRenderingContext2D,
  roll: TaikoDrumRoll,
  timeMs: number,
  scrollVel: number,
  skin: SkinAssets | undefined,
  hitResults: readonly HitResult[],
): void {
  const tint = computeDrumrollTint(roll, hitResults, timeMs);

  const xHead = objectX(roll.time, timeMs, scrollVel);
  const xEnd  = objectX(roll.endTime, timeMs, scrollVel);
  const r = roll.isStrong ? STRONG_NOTE_RADIUS_PX : NOTE_RADIUS_PX;

  const rollMiddle = skin ? skinImg(skin.images, 'taiko-roll-middle') : undefined;
  const rollEnd    = skin ? skinImg(skin.images, 'taiko-roll-end')    : undefined;
  const headStem   = roll.isStrong ? 'taikobigcircle'        : 'taikohitcircle';
  const overlayStem = roll.isStrong ? 'taikobigcircleoverlay' : 'taikohitcircleoverlay';
  const headBase = skin ? skinImg(skin.images, headStem)    : undefined;
  const headOverlay = skin ? skinImg(skin.images, overlayStem) : undefined;
  const tickSprite = skin ? skinImg(skin.images, 'sliderscorepoint') : undefined;

  const bodyVisible = xEnd > LANE_LEFT_X - 4 && xHead < LANE_RIGHT_X + r + 4;

  if (bodyVisible && rollMiddle !== undefined && rollEnd !== undefined) {
    // taiko-roll-middle is 1×128 (SD); stretched horizontally to body length.
    const d = r * 2;
    const endAspect = rollEnd.width / rollEnd.height;
    const endDrawW  = d * endAspect;
    const midX1 = xHead;
    const midX2 = xEnd;
    if (midX2 > midX1) {
      const tintedMid = tintBitmap(rollMiddle as unknown as ImageBitmap, tint);
      ctx.drawImage(tintedMid, midX1, LANE_CENTRE_Y - d / 2, midX2 - midX1, d);
    }
    const tintedEnd = tintBitmap(rollEnd as unknown as ImageBitmap, tint);
    ctx.drawImage(tintedEnd, xEnd, LANE_CENTRE_Y - d / 2, endDrawW, d);
  } else if (bodyVisible) {
    ctx.fillStyle = tint;
    ctx.beginPath();
    ctx.moveTo(xHead, LANE_CENTRE_Y - r);
    ctx.lineTo(xEnd,  LANE_CENTRE_Y - r);
    ctx.arc(xEnd, LANE_CENTRE_Y, r, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(xHead, LANE_CENTRE_Y + r);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  for (const tt of roll.tickTimes) {
    const xt = objectX(tt, timeMs, scrollVel);
    if (xt < LANE_LEFT_X - 4 || xt > LANE_RIGHT_X + 4) continue;
    if (tickSprite !== undefined) {
      drawCentredBitmap(ctx, tickSprite, xt, LANE_CENTRE_Y, 10);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath();
      ctx.arc(xt, LANE_CENTRE_Y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (xHead >= LANE_LEFT_X - r - 4 && xHead <= LANE_RIGHT_X + r + 4) {
    if (headBase !== undefined) {
      const d = r * 2;
      drawCentredBitmap(ctx, tintBitmap(headBase, tint), xHead, LANE_CENTRE_Y, d);
      if (headOverlay !== undefined) {
        const baseLogicalMax = baseLogicalExtent(skin!.images, headStem, headBase);
        const ovScale = skin!.images.has(`${overlayStem}@2x.png`) ? 0.5 : 1;
        drawOverlayNative(ctx, headOverlay, ovScale, xHead, LANE_CENTRE_Y, baseLogicalMax, d);
      }
    } else {
      ctx.fillStyle = tint;
      ctx.beginPath();
      ctx.arc(xHead, LANE_CENTRE_Y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.92)';
      ctx.lineWidth = roll.isStrong ? 3 : 2;
      ctx.stroke();
    }
  }
}

// Swell rendering, ported from stable's LegacySwell presentation.
// Reuses osu!std spinner sprites at natural sizes; no primitive fallback.

const SWELL_DISPLAY_OFFSET_X = 250;
const SWELL_DISPLAY_OFFSET_Y = 100;
const SWELL_BODY_BASE_SCALE      = 0.8;
const SWELL_APPROACH_START_SCALE = 1.86 * SWELL_BODY_BASE_SCALE;
const SWELL_APPROACH_END_SCALE   = 0.1 * SWELL_BODY_BASE_SCALE;
const SWELL_APPROACH_ALPHA       = 0.8;
const SWELL_FADE_IN_MS           = 200;
const SWELL_FADE_OUT_MS          = 300;
// Body bump per press damps back toward base; ~halflife 120ms (linear-decay approximation).
const SWELL_BODY_BUMP_PER_HIT    = 0.02;
const SWELL_BODY_BUMP_MAX        = 0.94 - SWELL_BODY_BASE_SCALE;
const SWELL_BODY_BUMP_DECAY_MS   = 240;
const RADIANS_PER_HIT            = Math.PI;
const SWELL_CLEAR_Y_START        = -40;
const SWELL_CLEAR_Y_DELTA        = -90 * (768 / 480);
const SWELL_CLEAR_MOVE_MS        = 240;
const SWELL_CLEAR_FADE_IN_MS     = 120;
const SWELL_COUNTER_Y_OFFSET     = 130;

// Sprite at natural display size; @2x halved. 1×1 → missing (skin-author suppression convention).
type SpriteWithScale = { bitmap: ImageBitmap; pixelScale: number };
function skinSpriteNatural(images: Map<string, ImageBitmap>, stem: string): SpriteWithScale | undefined {
  const at2x = images.get(`${stem}@2x.png`);
  if (at2x !== undefined && at2x.width > 1) return { bitmap: at2x, pixelScale: 0.5 };
  const at1x = images.get(`${stem}.png`);
  if (at1x !== undefined && at1x.width > 1) return { bitmap: at1x, pixelScale: 1.0 };
  return undefined;
}

function drawSpriteNatural(
  ctx: CanvasRenderingContext2D,
  sprite: SpriteWithScale,
  cx: number,
  cy: number,
  scale: number,
): void {
  const px = sprite.bitmap.width * sprite.pixelScale * scale * PLAYFIELD_SCALE;
  const py = sprite.bitmap.height * sprite.pixelScale * scale * PLAYFIELD_SCALE;
  ctx.drawImage(sprite.bitmap, cx - px / 2, cy - py / 2, px, py);
}

function scoreDigitNatural(images: Map<string, ImageBitmap>, digit: string): SpriteWithScale | undefined {
  return skinSpriteNatural(images, `score-${digit}`);
}

// Aborts on any missing digit to avoid mixed-glyph (skin + system-font) output.
function drawScoreDigits(
  ctx: CanvasRenderingContext2D,
  images: Map<string, ImageBitmap>,
  text: string,
  cx: number,
  cy: number,
  textScale: number,
): void {
  const sprites: SpriteWithScale[] = [];
  let totalW = 0;
  let maxH = 0;
  for (const ch of text) {
    const sp = scoreDigitNatural(images, ch);
    if (sp === undefined) return;
    sprites.push(sp);
    totalW += sp.bitmap.width * sp.pixelScale * textScale * PLAYFIELD_SCALE;
    const h = sp.bitmap.height * sp.pixelScale * textScale * PLAYFIELD_SCALE;
    if (h > maxH) maxH = h;
  }
  let x = cx - totalW / 2;
  for (const sp of sprites) {
    const w = sp.bitmap.width * sp.pixelScale * textScale * PLAYFIELD_SCALE;
    const h = sp.bitmap.height * sp.pixelScale * textScale * PLAYFIELD_SCALE;
    ctx.drawImage(sp.bitmap, x, cy - h / 2, w, h);
    x += w;
  }
}

function drawSwell(
  ctx: CanvasRenderingContext2D,
  swell: TaikoSwell,
  timeMs: number,
  scrollVel: number,
  progress: SwellProgress | undefined,
  skin: SkinAssets | undefined,
): void {
  if (skin === undefined) return;
  const sprWarning  = skinSpriteNatural(skin.images, 'spinner-warning');
  const sprCircle   = skinSpriteNatural(skin.images, 'spinner-circle');
  const sprApproach = skinSpriteNatural(skin.images, 'spinner-approachcircle');
  const sprOsu      = skinSpriteNatural(skin.images, 'spinner-osu');
  if (
    sprWarning === undefined && sprCircle === undefined
    && sprApproach === undefined && sprOsu === undefined
  ) return;

  let numHits = 0;
  if (progress !== undefined) {
    for (const t of progress.tickTimes) {
      if (t <= timeMs) numHits++;
      else break;
    }
  }
  const remaining = Math.max(0, swell.requiredHits - numHits);

  const terminalTime = progress?.completionTime ?? swell.endTime;
  const completed    = progress?.completionTime !== undefined;
  const visibleTo    = terminalTime + SWELL_FADE_OUT_MS;
  const visibleFrom  = swell.time - 4000;
  if (timeMs < visibleFrom || timeMs > visibleTo) return;

  // Scroll in, then park at hit target (lazer clamps X≥0).
  const scrollX = objectX(swell.time, timeMs, scrollVel);
  const cx = timeMs >= swell.time ? Math.max(HIT_TARGET_X, scrollX) : scrollX;
  const cy = LANE_CENTRE_Y;

  const offX = SWELL_DISPLAY_OFFSET_X * PLAYFIELD_SCALE;
  const offY = SWELL_DISPLAY_OFFSET_Y * PLAYFIELD_SCALE;
  const clusterCx = cx + offX;
  const clusterCy = cy + offY;

  // Generous cull bound — approach circle can be ~600px diameter at scale 1.488.
  const cull = 800;
  if (cx > LANE_RIGHT_X + cull || cx < LANE_LEFT_X - cull) return;

  // OutQuad fade-out after terminal time.
  let containerAlpha = 1;
  if (timeMs > terminalTime) {
    const t = (timeMs - terminalTime) / SWELL_FADE_OUT_MS;
    const u = 1 - Math.min(1, t);
    containerAlpha = u * u;
    if (containerAlpha <= 0) return;
  }

  ctx.save();
  ctx.globalAlpha = containerAlpha;

  // Warning: at outer centre pre-StartTime; over 200ms post-StartTime, moves to cluster, scales 1→3, fades out.
  if (sprWarning !== undefined && timeMs < swell.time + SWELL_FADE_IN_MS) {
    const activeT = timeMs - swell.time;
    let wx = cx, wy = cy, wScale = 1, wAlpha = 1;
    if (activeT >= 0) {
      const tProg = activeT / SWELL_FADE_IN_MS;
      wx = cx + offX * tProg;
      wy = cy + offY * tProg;
      wScale = 1 + 2 * tProg;
      wAlpha = 1 - tProg;
    }
    if (wAlpha > 0) {
      ctx.save();
      ctx.globalAlpha *= wAlpha;
      drawSpriteNatural(ctx, sprWarning, wx, wy, wScale);
      ctx.restore();
    }
  }

  if (timeMs >= swell.time) {
    const activeT = timeMs - swell.time;
    const duration = Math.max(1, swell.endTime - swell.time);
    const fadeIn = Math.min(1, activeT / SWELL_FADE_IN_MS);

    if (sprApproach !== undefined) {
      const tProg = Math.min(1, activeT / duration);
      let approachScale = SWELL_APPROACH_START_SCALE
        + (SWELL_APPROACH_END_SCALE - SWELL_APPROACH_START_SCALE) * tProg;
      if (completed && timeMs >= terminalTime) approachScale = SWELL_APPROACH_END_SCALE;
      ctx.save();
      ctx.globalAlpha *= SWELL_APPROACH_ALPHA * fadeIn;
      drawSpriteNatural(ctx, sprApproach, clusterCx, clusterCy, approachScale);
      ctx.restore();
    }

    if (sprCircle !== undefined) {
      let bumpAccum = 0;
      if (progress !== undefined) {
        for (let i = progress.tickTimes.length - 1; i >= 0; i--) {
          const t = progress.tickTimes[i]!;
          if (t > timeMs) continue;
          const age = timeMs - t;
          if (age >= SWELL_BODY_BUMP_DECAY_MS) break;
          bumpAccum += SWELL_BODY_BUMP_PER_HIT * (1 - age / SWELL_BODY_BUMP_DECAY_MS);
          if (bumpAccum >= SWELL_BODY_BUMP_MAX) { bumpAccum = SWELL_BODY_BUMP_MAX; break; }
        }
      }
      let bodyScale = SWELL_BODY_BASE_SCALE + bumpAccum;
      if (completed && timeMs >= terminalTime) {
        const cAge = timeMs - terminalTime;
        const cT = Math.min(1, cAge / SWELL_FADE_OUT_MS);
        const outQuad = 1 - (1 - cT) * (1 - cT);
        bodyScale += 0.05 * outQuad;
      }
      const rotation = numHits * RADIANS_PER_HIT;

      ctx.save();
      ctx.globalAlpha *= fadeIn;
      ctx.translate(clusterCx, clusterCy);
      ctx.rotate(rotation);
      drawSpriteNatural(ctx, sprCircle, 0, 0, bodyScale);
      ctx.restore();
    }

    const textScale = swell.requiredHits > 0
      ? 1.6 - 0.6 * (remaining / swell.requiredHits)
      : 1.6;
    const textCy = clusterCy + SWELL_COUNTER_Y_OFFSET * PLAYFIELD_SCALE;
    ctx.save();
    ctx.globalAlpha *= fadeIn;
    drawScoreDigits(ctx, skin.images, String(remaining), clusterCx, textCy, textScale);
    ctx.restore();
  }

  if (completed && sprOsu !== undefined) {
    const cAge = timeMs - progress!.completionTime!;
    if (cAge >= 0) {
      const moveProg = Math.min(1, cAge / SWELL_CLEAR_MOVE_MS);
      const fadeIn   = Math.min(1, cAge / SWELL_CLEAR_FADE_IN_MS);
      const yOffset  = (SWELL_CLEAR_Y_START + SWELL_CLEAR_Y_DELTA * moveProg) * PLAYFIELD_SCALE;
      ctx.save();
      ctx.globalAlpha *= fadeIn;
      drawSpriteNatural(ctx, sprOsu, clusterCx, clusterCy + yOffset, 1);
      ctx.restore();
    }
  }

  ctx.restore();
}

function drawObject(
  ctx: CanvasRenderingContext2D,
  o: TaikoHitObject,
  timeMs: number,
  scrollVel: number,
  skin: SkinAssets | undefined,
  judgmentByNote: ReadonlyMap<number, { time: number; judgement: number }>,
  beatmap: BeatmapData,
  comboNow: number,
  hitResults: readonly HitResult[],
  isHD: boolean,
): void {
  if (o.kind === 'hit')           drawHit(ctx, o, timeMs, scrollVel, skin, judgmentByNote, beatmap, comboNow, isHD);
  else if (o.kind === 'drumroll') drawDrumRoll(ctx, o, timeMs, scrollVel, skin, hitResults);
  // Swells render outside the lane clip (drawTaikoPlayfield). HD doesn't fade drumroll/swell.
}

// Kiai glow (taiko-glow): fades on/off with kiai; per-hit pulse 0.8 → 0.95 → 0.8 over 80ms.










function lastKiaiTransitionAt(
  tps: readonly TimingPoint[],
  timeMs: number,
): { transitionTime: number; kiaiOn: boolean } {
  let prev = false;
  let transitionTime = -Infinity;
  let kiaiOn = false;
  for (const tp of tps) {
    if (tp.time > timeMs) break;
    if (tp.kiai !== prev) {
      transitionTime = tp.time;
      kiaiOn = tp.kiai;
      prev = tp.kiai;
    }
  }
  return { transitionTime, kiaiOn };
}

function drawTaikoGlow(
  ctx: CanvasRenderingContext2D,
  beatmap: BeatmapData,
  results: readonly HitResult[],
  timeMs: number,
  skin: SkinAssets | undefined,
): void {
  // The built-in preview keeps feedback local; this legacy effect is disabled.
}

// Hit-target explosion (separate from floating popup). Multi-frame skips scale-punch.



 // 300








// Default frame length = 1000/frameCount; non-looping (clamp to last).


/**
 * True when the skin ships taiko-hit300 in any variant, i.e. it uses hit-target
 * explosions. Callers use this to suppress the floating judgement popup — a
 * skin gets one style or the other, never both.
 */
export function hasTaikoExplosion(skin: SkinAssets | undefined): boolean {
  if (skin === undefined) return false;
  const i = skin.images;
  return i.has('taiko-hit300.png')      || i.has('taiko-hit300@2x.png')
      || i.has('taiko-hit300-0.png')    || i.has('taiko-hit300-0@2x.png');
}

function drawHitExplosions(
  ctx: CanvasRenderingContext2D,
  results: readonly HitResult[],
  timeMs: number,
  skin: SkinAssets | undefined,
): void {
  // The built-in preview keeps feedback local; this legacy effect is disabled.
}

// Pippidon mascot: idle/kiai/clear/fail. Clear is one-shot 15-frame mirror sequence; others BPM-paced.

const MASCOT_SCALE          = 0.6;
const MASCOT_FEET_Y         = PLAYFIELD_TOP_Y + 0.2 * PLAYFIELD_H_PX;
const MASCOT_ANCHOR_X       = 4;
const MASCOT_CLEAR_FRAME_MS = 100;
const MASCOT_CLEAR_ORDER    = [0, 1, 2, 3, 4, 5, 6, 5, 6, 5, 4, 3, 2, 1, 0] as const;
const MASCOT_CLEAR_TOTAL_MS = MASCOT_CLEAR_FRAME_MS * MASCOT_CLEAR_ORDER.length;

type MascotState = 'idle' | 'kiai' | 'clear' | 'fail';

// NO-DASH naming: pippidonidle0, pippidonidle1, ... Bare pippidonidle as fallback for index 0.
function resolvePippidonFrames(images: Map<string, ImageBitmap>, stem: string): SpriteWithScale[] {
  const frames: SpriteWithScale[] = [];
  for (let i = 0; ; i++) {
    const numbered = skinSpriteNatural(images, `${stem}${i}`);
    if (numbered !== undefined) { frames.push(numbered); continue; }
    if (i === 0) {
      const bare = skinSpriteNatural(images, stem);
      if (bare !== undefined) { frames.push(bare); continue; }
    }
    break;
  }
  return frames;
}

function lastComboAffectingResult(
  results: readonly HitResult[],
  timeMs: number,
): HitResult | undefined {
  const n = results.length;
  if (n === 0) return undefined;
  let lo = 0, hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (results[mid]!.time <= timeMs) lo = mid + 1; else hi = mid;
  }
  for (let i = lo - 1; i >= 0; i--) {
    const r = results[i]!;
    if (r.comboIgnore) continue;
    return r;
  }
  return undefined;
}

// Latest combo%50 milestone OR swell completion at/before timeMs (within MASCOT_CLEAR_TOTAL_MS window).
function lastClearTriggerTime(
  results: readonly HitResult[],
  comboFrames: readonly ComboFrame[],
  timeMs: number,
): number | undefined {
  const cn = comboFrames.length;
  let cLo = 0, cHi = cn;
  while (cLo < cHi) {
    const mid = (cLo + cHi) >>> 1;
    if (comboFrames[mid]!.time <= timeMs) cLo = mid + 1; else cHi = mid;
  }
  let trigger = -Infinity;
  for (let i = cLo - 1; i >= 0; i--) {
    const cf = comboFrames[i]!;
    if (timeMs - cf.time > MASCOT_CLEAR_TOTAL_MS + 16) break;
    if (cf.combo > 0 && cf.combo % 50 === 0) { trigger = cf.time; break; }
  }
  const rn = results.length;
  let rLo = 0, rHi = rn;
  while (rLo < rHi) {
    const mid = (rLo + rHi) >>> 1;
    if (results[mid]!.time <= timeMs) rLo = mid + 1; else rHi = mid;
  }
  for (let i = rLo - 1; i >= 0; i--) {
    const r = results[i]!;
    if (timeMs - r.time > MASCOT_CLEAR_TOTAL_MS + 16) break;
    // hitJudge contract: swell completion = comboIgnore && strong === true.
    if (r.comboIgnore && r.strong === true && r.judgement > 0) {
      if (r.time > trigger) trigger = r.time;
      break;
    }
  }
  return isFinite(trigger) ? trigger : undefined;
}

function drawTaikoMascot(
  ctx: CanvasRenderingContext2D,
  beatmap: BeatmapData,
  results: readonly HitResult[],
  comboFrames: readonly ComboFrame[],
  timeMs: number,
  skin: SkinAssets | undefined,
): void {
  if (skin === undefined) return;

  const clearTrigger = lastClearTriggerTime(results, comboFrames, timeMs);
  let state: MascotState;
  let clearAge = 0;
  if (clearTrigger !== undefined) {
    clearAge = timeMs - clearTrigger;
    if (clearAge < MASCOT_CLEAR_TOTAL_MS) {
      state = 'clear';
    } else {
      // Clear sequence ended — fall through to base state.
      const lastR = lastComboAffectingResult(results, timeMs);
      const { kiai } = getTimingAt(beatmap.timingPoints, timeMs);
      if (lastR && lastR.judgement === 0) state = 'fail';
      else if (kiai)                       state = 'kiai';
      else                                 state = 'idle';
    }
  } else {
    const lastR = lastComboAffectingResult(results, timeMs);
    const { kiai } = getTimingAt(beatmap.timingPoints, timeMs);
    if (lastR && lastR.judgement === 0) state = 'fail';
    else if (kiai)                       state = 'kiai';
    else                                 state = 'idle';
  }

  // Mascot uses NO-DASH frame naming (pippidonidle0, …), unlike the rest of the taiko sprite family.
  const stateStem = `pippidon${state}`;
  const frames = resolvePippidonFrames(skin.images, stateStem);
  if (frames.length === 0) return;

  let frameIdx: number;
  if (state === 'clear') {
    const seqIdx = Math.min(MASCOT_CLEAR_ORDER.length - 1, Math.floor(clearAge / MASCOT_CLEAR_FRAME_MS));
    const target = MASCOT_CLEAR_ORDER[seqIdx]!;
    // Cap to available frames (skinner may ship fewer than 7); the loader
    // stops at the first missing frame and the partial sequence plays.
    frameIdx = Math.min(target, frames.length - 1);
  } else {
    // BPM-paced: one frame per beat of the active uninherited timing point.
    const tp = getUninheritedAt(beatmap.timingPoints, timeMs);
    const beat = tp.beatLength > 0 ? Math.floor((timeMs - tp.time) / tp.beatLength) : 0;
    const wrapped = ((beat % frames.length) + frames.length) % frames.length;
    frameIdx = wrapped;
  }

  const sp = frames[frameIdx]!;
  const naturalW = sp.bitmap.width * sp.pixelScale;
  const naturalH = sp.bitmap.height * sp.pixelScale;
  const drawW = naturalW * MASCOT_SCALE;
  const drawH = naturalH * MASCOT_SCALE;
  const dx = MASCOT_ANCHOR_X;
  const dy = MASCOT_FEET_Y - drawH;
  ctx.drawImage(sp.bitmap, dx, dy, drawW, drawH);
}

// Freshest press time per action within [timeMs - DRUM_FLASH_MS, timeMs]; binary-searched.
function activeActionsAt(
  events: readonly TaikoInputEvent[],
  timeMs: number,
): Record<TaikoAction, number> {
  const out: Record<TaikoAction, number> = {
    LeftRim: -Infinity, LeftCentre: -Infinity,
    RightCentre: -Infinity, RightRim: -Infinity,
  };
  const n = events.length;
  if (n === 0) return out;
  const minT = timeMs - DRUM_FLASH_MS;
  let lo = 0, hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (events[mid]!.time < minT) lo = mid + 1; else hi = mid;
  }
  for (let i = lo; i < n; i++) {
    const ev = events[i]!;
    if (ev.time > timeMs) break;
    if (ev.time > out[ev.action]) out[ev.action] = ev.time;
  }
  return out;
}

function drawInputDrum(
  ctx: CanvasRenderingContext2D,
  events: readonly TaikoInputEvent[],
  timeMs: number,
  skin: SkinAssets | undefined,
): void {
  drawFlatInputDrum(ctx, activeActionsAt(events, timeMs), timeMs, skin?.images, 0, PLAYFIELD_TOP_Y, INPUT_DRUM_W_PX, PLAYFIELD_H_PX);
}

/**
 * Per-frame entry point: draws the whole taiko playfield for `timeMs` onto the
 * 1280×720 logical canvas, reading (never mutating) the prebuilt session.
 * Order: background → kiai glow → hit target → explosions
 * → [lane clip] bar lines + objects → flying-hits → drum → swells → mascot → FL.
 */
export function drawTaikoPlayfield(
  ctx: CanvasRenderingContext2D,
  session: TaikoSession,
  timeMs: number,
  options: RenderOptions,
): void {
  const objectVel  = session.objectVel;
  const barLineVel = session.barLineVel;
  const maxScrollMs = session.maxScrollMs;
  const skin: SkinAssets | undefined = session.skin;
  const comboNow = comboAt(session.comboFrames, timeMs);
  const isHD = options.modHidden;

  // Lookback covers the longest still-trailing drum-roll/swell.
  const lookback = taikoLookback(session.objects);
  const trackOpacity = resolveTrackOpacity(options, 'taiko');

  drawPlayfieldBackground(ctx, skin, session.beatmap.timingPoints, timeMs, trackOpacity);
  drawTaikoGlow(ctx, session.beatmap, session.hitResults, timeMs, skin);
  drawHitTarget(ctx, skin);
  drawHitExplosions(ctx, session.hitResults, timeMs, skin);

  // Clip horizontally (notes enter at the right edge, exit past the drum on the left) but NOT
  // vertically: stable's taiko playfield doesn't mask notes top/bottom, and a skin can ship a tall
  // taikobigcircleoverlay (4sbet1) whose "this note is big" arrow pokes above the lane. Regular
  // notes never reach the lane's vertical edges, so the full-height band is a no-op for them; only
  // such overflowing overlays become visible. Bar lines + flying-hits set their own y, unaffected.
  ctx.save();
  ctx.beginPath();
  ctx.rect(LANE_LEFT_X, 0, LANE_RIGHT_X - LANE_LEFT_X, LOGICAL_H);
  ctx.clip();

  ctx.save();
  ctx.globalAlpha *= trackOpacity;
  drawBarLines(ctx, session.barLines, barLineVel, timeMs, maxScrollMs, lookback, skin);
  ctx.restore();

  const { firstIdx, lastIdx } = findObjectVisibleRange(session.objects, timeMs, maxScrollMs, lookback);
  // Back-to-front: later objects drawn first so earlier-in-time notes overlap on top.
  for (let i = lastIdx; i >= firstIdx; i--) {
    drawObject(
      ctx, session.objects[i]!, timeMs, objectVel[i]!, skin,
      session.hitJudgmentByNote,
      session.beatmap, comboNow,
      session.hitResults,
      isHD,
    );
  }

  ctx.restore();

  // Flying-hit arc renders outside lane clip so the parabola isn't masked (lazer's ProxyContent).
  drawFlyingHits(
    ctx, session.objects, objectVel, firstIdx, lastIdx, timeMs, skin,
    session.hitJudgmentByNote, session.beatmap, comboNow,
  );

  // Drum-roll tick hits fly off too (same layer); shown even in HD since the roll stays visible.
  drawDrumRollFlyingHits(
    ctx, session.objects, objectVel, firstIdx, lastIdx, timeMs, skin,
    session.hitResults, session.beatmap, comboNow,
  );

  drawInputDrum(ctx, session.inputEvents, timeMs, skin);

  // Swells render outside the lane clip and after the drum: the spinner cluster can extend past both.
  for (let i = lastIdx; i >= firstIdx; i--) {
    const o = session.objects[i]!;
    if (o.kind !== 'swell') continue;
    drawSwell(ctx, o, timeMs, objectVel[i]!, session.swellProgress.get(o.sourceIndex), skin);
  }

  drawTaikoMascot(ctx, session.beatmap, session.hitResults, session.comboFrames, timeMs, skin);

  // FL last: lazer's Depth=float.MinValue puts it above everything (notes, drum, swells, mascot).
  if (options.modFlashlight) taikoFlashlight(session).draw(ctx, timeMs);
}

// FL toggled on for a non-FL replay: built lazily on first draw (FL replays get theirs
// at session build).
const _flCache = new WeakMap<TaikoSession, TaikoFlashlight>();
function taikoFlashlight(session: TaikoSession): TaikoFlashlight {
  if (session.flashlight !== null) return session.flashlight;
  let fl = _flCache.get(session);
  if (fl === undefined) {
    fl = new TaikoFlashlight(session.beatmap, session.comboFrames);
    _flCache.set(session, fl);
  }
  return fl;
}
