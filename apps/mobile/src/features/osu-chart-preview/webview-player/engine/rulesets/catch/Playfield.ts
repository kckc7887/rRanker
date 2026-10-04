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
import type { SkinAssets } from '../../types/index';
import type { CatchSession, CatchObject } from './types';
import type { CatcherFrame } from './input';
import type { RenderOptions } from '../../renderer/Renderer';
import { calculateScaleFromCircleSize } from './converter';
import { sampleCatcherX } from './input';
import { CatchFlashlight } from './Flashlight';
import { drawManiaCombo } from '../../renderer/HUDRenderer';

const PLAYFIELD_W = 512;
const OBJECT_RADIUS = 64;
const CATCHER_BASE_SIZE = 106.75;
const ALLOWED_CATCH_RANGE = 0.8;

const CANVAS_W = 1280;

/** 下落区域为 osu!y=-100..340，共 440 单位。 */

const FALL_TOP_OSU = -100;
const CATCH_LINE_OSU = 340;
const FALL_BAND_OSU = CATCH_LINE_OSU - FALL_TOP_OSU;

/** x/y 等比缩放，保持下落区域比例。 */

const S = 1.4;
const SCREEN_PLAYFIELD_W = PLAYFIELD_W * S;
const OFFSET_X = (CANVAS_W - SCREEN_PLAYFIELD_W) / 2;
const CATCH_LINE_Y = 628;

/** combo 跟随接盘者 x，中心距落点 350/2 个逻辑单位。 */

const CATCH_PLAYFIELD_LOGICAL_H = 384;
const COMBO_MARGIN_BOTTOM_OSU = 350;
const COMBO_CENTRE_ABOVE_LINE_OSU =
  (COMBO_MARGIN_BOTTOM_OSU / 2) * (FALL_BAND_OSU / CATCH_PLAYFIELD_LOGICAL_H);

function screenX(effectiveX: number): number {
  return OFFSET_X + effectiveX * S;
}
/** frac=1 在顶部，0 在接盘线。 */
function screenYFromFrac(frac: number): number {
  return CATCH_LINE_Y - frac * FALL_BAND_OSU * S;
}

/** 下落时间使用浮点 DifficultyRange，不取整。 */

function difficultyRange(diff: number, min: number, mid: number, max: number): number {
  if (diff > 5) return mid + (max - mid) * (diff - 5) / 5;
  if (diff < 5) return mid + (mid - min) * (diff - 5) / 5;
  return mid;
}

/** 下落窗口用谱面 ms；DT/HT 仅改变播放速度。 */

function fallTimeMs(ar: number): number {
  return difficultyRange(ar, 1800, 1200, 450);
}

/** Hidden 在 0.6×preempt 至 0.44×preempt 间淡出。 */

function hdFadeAlpha(frac: number): number {
  if (frac >= 0.6) return 1;
  if (frac <= 0.44) return 0;
  return (frac - 0.44) / 0.16;
}

/** 判定盘宽乘 0.8，贴图宽度不乘该系数。 */

function catchWidthOsu(cs: number): number {
  return CATCHER_BASE_SIZE * Math.abs(calculateScaleFromCircleSize(cs) * 2) * ALLOWED_CATCH_RANGE;
}

/** 随机外观按 StartTime 确定，seek 后保持一致。 */

function randomSingle(seed: number, series: number): number {
  let h = (Math.imul(Math.trunc(seed) | 0, 2654435761) + Math.imul(series | 0, 40503)) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 3266489917) >>> 0;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const DEFAULT_COMBO_COLORS = ['#e879a0', '#68b3f0', '#f7e04a', '#90e070', '#f08040'];

const BANANA_COLORS = ['rgb(255,240,0)', 'rgb(255,192,0)', 'rgb(214,221,28)'];
const HYPER_COLOR = 'rgb(255,0,0)';

function comboColorFor(session: CatchSession, indexInBeatmap: number): string {
  const palette = session.skin.config.comboColors.length > 0
    ? session.skin.config.comboColors
    : DEFAULT_COMBO_COLORS;
  /** catch 按顶层音符轮换颜色，不按 newCombo。 */

  return palette[(indexInBeatmap + 1) % palette.length]!;
}

const RADIUS_ADJUST = 1.1;
const LARGE_PULP_3 = 16 * RADIUS_ADJUST;
const LARGE_PULP_4 = LARGE_PULP_3 * 0.925;
const SMALL_PULP = 8 * RADIUS_ADJUST;
const DIST_3 = 0.15;
const DIST_4 = 0.15 / 0.925;
const BORDER_THICKNESS = 6 * RADIUS_ADJUST;
const HYPER_BORDER_THICKNESS = 12 * RADIUS_ADJUST;

interface PulpLayout {
  topSmall: readonly [number, number]; /** 形状位置按 128px 盒归一化，角度用度。 */
  largeAngles: readonly number[];
  largeSize: number;
  largeDist: number;
}

const PULP_LAYOUTS: readonly PulpLayout[] = [
  { topSmall: [0, -0.33], largeAngles: [60, 180, 300],      largeSize: LARGE_PULP_3, largeDist: DIST_3 },
  { topSmall: [0, -0.25], largeAngles: [0, 120, 240],       largeSize: LARGE_PULP_3, largeDist: DIST_3 },
  { topSmall: [0, -0.30], largeAngles: [45, 135, 225, 315], largeSize: LARGE_PULP_4, largeDist: DIST_4 },
  { topSmall: [0, -0.34], largeAngles: [0, 90, 180, 270],   largeSize: LARGE_PULP_4, largeDist: DIST_4 },
];

/** 角度用度，x=dist×sin，y=dist×cos。 */
function pulpOffset(angleDeg: number, dist: number): [number, number] {
  const a = (angleDeg * Math.PI) / 180;
  return [dist * Math.sin(a), dist * Math.cos(a)];
}

function drawPulp(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, accent: string): void {
  ctx.save();
  /** 绝对透明度仍乘外层 Hidden 淡出系数。 */

  const a = ctx.globalAlpha;
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.45 * a;
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 1.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.9 * a;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawFruit(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  obj: CatchObject,
  accent: string,
  frac: number,
  fallMs: number,
): void {
  const fruitScale = obj.scale * S;
  const boxR = OBJECT_RADIUS * fruitScale;
  const layout = PULP_LAYOUTS[obj.indexInBeatmap % 4]!;
  const rotation = ((randomSingle(obj.startTime, 1) - 0.5) * 40 * Math.PI) / 180;

  ctx.save();
  const a = ctx.globalAlpha;
  ctx.translate(cx, cy);
  ctx.rotate(rotation);

  const largeR = layout.largeSize * 0.5 * fruitScale;
  for (const ang of layout.largeAngles) {
    const [ox, oy] = pulpOffset(ang, layout.largeDist);
    drawPulp(ctx, ox * boxR * 2, oy * boxR * 2, largeR, accent);
  }
  drawPulp(ctx, layout.topSmall[0] * boxR * 2, layout.topSmall[1] * boxR * 2, SMALL_PULP * 0.5 * fruitScale, accent);

  const borderAlpha = Math.max(0, Math.min(1, (frac * fallMs) / 500));
  if (borderAlpha > 0) {
    ctx.globalAlpha = borderAlpha * a;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = BORDER_THICKNESS * fruitScale;
    ctx.beginPath();
    ctx.arc(0, 0, boxR - (BORDER_THICKNESS * fruitScale) / 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = a;
  }

  if (obj.hyperDash) drawHyperRing(ctx, boxR, HYPER_BORDER_THICKNESS * fruitScale);

  ctx.restore();
}

function drawHyperRing(ctx: CanvasRenderingContext2D, boxR: number, thickness: number): void {
  ctx.save();

  const a = ctx.globalAlpha;
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.3 * a;
  ctx.fillStyle = HYPER_COLOR;
  ctx.beginPath();
  ctx.arc(0, 0, boxR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = HYPER_COLOR;
  ctx.lineWidth = thickness;
  ctx.beginPath();
  ctx.arc(0, 0, boxR - thickness / 2, 0, Math.PI * 2);
  ctx.stroke();
}

function drawDroplet(ctx: CanvasRenderingContext2D, cx: number, cy: number, obj: CatchObject, accent: string): void {
  /** 水滴基础盒为 32px，tiny 再减半。 */
  const factor = obj.type === 'tinyDroplet' ? 0.5 : 1;
  const r = (OBJECT_RADIUS / 4) * obj.scale * factor * S;
  ctx.save();
  const a = ctx.globalAlpha;
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.9 * a;
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  if (obj.hyperDash && obj.type === 'droplet') {
    ctx.save();
    ctx.translate(cx, cy);
    drawHyperRing(ctx, r, 6 * obj.scale * S);
    ctx.restore();
  }
}

function drawBanana(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  obj: CatchObject,
  frac: number,
): void {
  const seed = obj.startTime;
  const color = BANANA_COLORS[Math.floor(randomSingle(seed, 0) * 3) % 3]!;

  const p = Math.max(0, Math.min(1, 1 - frac));
  const startScale = 0.6 + 1.6 * randomSingle(seed, 3);
  const scale = (startScale + (0.6 - startScale) * p);
  const startAngle = 180 * (randomSingle(seed, 1) * 2 - 1);
  const endAngle = 180 * (randomSingle(seed, 2) * 2 - 1);
  const rot = ((startAngle + (endAngle - startAngle) * p) * Math.PI) / 180;

  const boxR = OBJECT_RADIUS * obj.scale * scale * S;
  ctx.save();
  const a = ctx.globalAlpha;
  ctx.translate(cx, cy);
  ctx.rotate(rot);

  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.9 * a;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, 0, boxR * 0.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';

  ctx.globalAlpha = a;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = BORDER_THICKNESS * obj.scale * scale * S;
  ctx.beginPath();
  ctx.arc(0, 0, boxR - (BORDER_THICKNESS * obj.scale * scale * S) / 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

interface LegacySprite { bitmap: ImageBitmap; logW: number; logH: number; }

function skinSprite(skin: SkinAssets, stem: string): LegacySprite | undefined {
  const hi = skin.images.get(`${stem}@2x.png`);
  if (hi !== undefined) return { bitmap: hi, logW: hi.width / 2, logH: hi.height / 2 };
  const lo = skin.images.get(`${stem}.png`);
  if (lo !== undefined) return { bitmap: lo, logW: lo.width, logH: lo.height };
  return undefined;
}

/** Pineapple 素材名为 fruit-apple，Raspberry 为 fruit-orange。 */

const LEGACY_FRUIT_STEMS = ['fruit-pear', 'fruit-grapes', 'fruit-apple', 'fruit-orange'] as const;
const HYPER_HEX = '#ff0000';

const BANANA_TINTS = ['#fff000', '#ffc000', '#d6dd1c'];

function blitPiece(
  ctx: CanvasRenderingContext2D,
  base: LegacySprite,
  overlay: LegacySprite | undefined,
  pxPerOsu: number,
  tintHex: string,
  hyper: boolean,
): void {
  const bw = base.logW * pxPerOsu;
  const bh = base.logH * pxPerOsu;

  const a = ctx.globalAlpha;
  if (hyper) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.7 * a;
    const hw = bw * 1.2;
    const hh = bh * 1.2;
    ctx.drawImage(tintSprite(base.bitmap, HYPER_HEX), -hw / 2, -hh / 2, hw, hh);
    ctx.restore();
  }
  ctx.drawImage(tintSprite(base.bitmap, tintHex), -bw / 2, -bh / 2, bw, bh);
  if (overlay !== undefined) {
    const ow = overlay.logW * pxPerOsu;
    const oh = overlay.logH * pxPerOsu;
    ctx.drawImage(overlay.bitmap, -ow / 2, -oh / 2, ow, oh);
  }
}

function drawLegacyFruit(
  ctx: CanvasRenderingContext2D, session: CatchSession, cx: number, cy: number, obj: CatchObject,
): boolean {
  const base = skinSprite(session.skin, LEGACY_FRUIT_STEMS[obj.indexInBeatmap % 4]!);
  if (base === undefined) return false;
  const overlay = skinSprite(session.skin, `${LEGACY_FRUIT_STEMS[obj.indexInBeatmap % 4]!}-overlay`);

  const rotation = ((randomSingle(obj.startTime, 1) - 0.5) * 40 * Math.PI) / 180;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotation);
  blitPiece(ctx, base, overlay, obj.scale * S, comboColorFor(session, obj.indexInBeatmap), obj.hyperDash);
  ctx.restore();
  return true;
}

function drawLegacyDroplet(
  ctx: CanvasRenderingContext2D, session: CatchSession, cx: number, cy: number, obj: CatchObject,
  frac: number, fallMs: number,
): boolean {
  const base = skinSprite(session.skin, 'fruit-drop');
  if (base === undefined) return false;
  const overlay = skinSprite(session.skin, 'fruit-drop-overlay');
  const tinyFactor = obj.type === 'tinyDroplet' ? 0.5 : 1;

  const startRot = randomSingle(obj.startTime, 1) * 20;
  const preemptProgress = (fallMs * (1 - frac)) / (fallMs + 2000);
  const rotation = ((startRot + 720 * preemptProgress) * Math.PI) / 180;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotation);
  /** legacy 水滴素材按 0.8 比例绘制。 */
  blitPiece(ctx, base, overlay, obj.scale * S * 0.8 * tinyFactor,
    comboColorFor(session, obj.indexInBeatmap), obj.hyperDash && obj.type === 'droplet');
  ctx.restore();
  return true;
}

function drawLegacyBanana(
  ctx: CanvasRenderingContext2D, session: CatchSession, cx: number, cy: number, obj: CatchObject, frac: number,
): boolean {
  const base = skinSprite(session.skin, 'fruit-bananas');
  if (base === undefined) return false;
  const overlay = skinSprite(session.skin, 'fruit-bananas-overlay');
  const seed = obj.startTime;
  const tint = BANANA_TINTS[Math.floor(randomSingle(seed, 0) * 3) % 3]!;

  const p = Math.max(0, Math.min(1, 1 - frac));
  const startScale = 0.6 + 1.6 * randomSingle(seed, 3);
  const scaleAnim = startScale + (0.6 - startScale) * p;
  const startAngle = 180 * (randomSingle(seed, 1) * 2 - 1);
  const endAngle = 180 * (randomSingle(seed, 2) * 2 - 1);
  const rotation = ((startAngle + (endAngle - startAngle) * p) * Math.PI) / 180;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotation);
  blitPiece(ctx, base, overlay, obj.scale * S * scaleAnim, tint, false);
  ctx.restore();
  return true;
}

function catcherVisualWidthOsu(cs: number): number {
  return catchWidthOsu(cs) / ALLOWED_CATCH_RANGE;
}

/** 以素材 y=16 的盘沿对齐落点。 */

const CATCHER_RIM_Y = 16;

const CATCHER_SCALE = 1.0;
const CATCHER_TOP_OFFSET = 0;

/** Version<2.3 且有 fruit-ryuuta 时，使用该接盘者素材。 */

function skinVersionAsNumber(version: string): number {
  const v = version.trim().toLowerCase();
  if (v === '') return 1.0;
  if (v === 'latest') return Infinity;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 1.0;
}
function isOldStyleCatcher(skin: SkinAssets): boolean {
  return skinVersionAsNumber(skin.config.version) < 2.3
    && skinImg(skin, 'fruit-ryuuta') !== undefined;
}

const HYPER_TRANSITION_MS = 180;

function outQuint(p: number): number {
  const x = p < 0 ? 0 : p > 1 ? 1 : p;
  const inv = 1 - x;
  return 1 - inv * inv * inv * inv * inv;
}

function skinImg(skin: SkinAssets, stem: string): ImageBitmap | undefined {
  return skin.images.get(`${stem}@2x.png`) ?? skin.images.get(`${stem}.png`);
}

const tintCache = new WeakMap<ImageBitmap, Map<string, OffscreenCanvas>>();
function tintSprite(bitmap: ImageBitmap, tintHex: string): CanvasImageSource {
  let bucket = tintCache.get(bitmap);
  if (bucket === undefined) { bucket = new Map(); tintCache.set(bitmap, bucket); }
  const cached = bucket.get(tintHex);
  if (cached !== undefined) return cached;

  const c = new OffscreenCanvas(bitmap.width, bitmap.height);
  const cx = c.getContext('2d');
  if (cx === null) return bitmap;
  cx.drawImage(bitmap, 0, 0);
  cx.globalCompositeOperation = 'multiply';
  cx.fillStyle = tintHex;
  cx.fillRect(0, 0, c.width, c.height);
  cx.globalCompositeOperation = 'destination-in';
  cx.drawImage(bitmap, 0, 0);
  bucket.set(tintHex, c);
  return c;
}

function redTinted(bitmap: ImageBitmap): CanvasImageSource {
  return tintSprite(bitmap, '#ff0000');
}

type CatcherState = 'idle' | 'fail' | 'kiai';
interface HyperWindow { start: number; end: number; }
interface CatchVisualState {

  stateChanges: { time: number; state: CatcherState }[];

  hypers: HyperWindow[];



}

const _visualCache = new WeakMap<CatchSession, CatchVisualState>();

function kiaiAt(session: CatchSession, time: number): boolean {
  let kiai = false;
  for (const tp of session.beatmap.timingPoints) {
    if (tp.time > time) break;
    kiai = tp.kiai;
  }
  return kiai;
}

function visualState(session: CatchSession): CatchVisualState {
  let vs = _visualCache.get(session);
  if (vs !== undefined) return vs;

  const sorted = sortedObjects(session);
  const results = session.hitResults;

  const stateChanges: { time: number; state: CatcherState }[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const obj = sorted[i]!;
    const caughtHit = (results[i]?.judgement ?? 0) > 0;
    /** 香蕉不改变接盘者动画状态。 */

    if (obj.type === 'fruit' || obj.type === 'droplet') {
      stateChanges.push({
        time: obj.startTime,
        state: caughtHit ? (kiaiAt(session, obj.startTime) ? 'kiai' : 'idle') : 'fail',
      });
    }
  }

  /** 接到 hyper 物件后，冲刺持续至下一个水果或非 tiny 水滴。 */

  const hypers: HyperWindow[] = [];
  let prevIdx = -1;
  for (let i = 0; i < sorted.length; i++) {
    const obj = sorted[i]!;
    if (obj.type !== 'fruit' && obj.type !== 'droplet') continue;
    if (prevIdx >= 0) {
      const prev = sorted[prevIdx]!;
      if (prev.hyperDash && (results[prevIdx]?.judgement ?? 0) > 0) {
        hypers.push({ start: prev.startTime, end: obj.startTime });
      }
    }
    prevIdx = i;
  }

  vs = { stateChanges, hypers };
  _visualCache.set(session, vs);
  return vs;
}

function catcherStateAt(vs: CatchVisualState, t: number): CatcherState {
  const a = vs.stateChanges;
  let lo = 0, hi = a.length - 1, res = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (a[mid]!.time <= t) { res = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return res < 0 ? 'idle' : a[res]!.state;
}

/** 红色冲刺效果在前后各 180ms 内渐变；相邻冲刺按最大值混合。 */

function hyperFactorAt(vs: CatchVisualState, t: number): number {
  const a = vs.hypers;
  let lo = 0, hi = a.length - 1, idx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (a[mid]!.start <= t) { idx = mid; lo = mid + 1; } else hi = mid - 1;
  }
  let f = 0;
  for (let i = idx; i >= 0; i--) {
    const h = a[i]!;
    if (h.end + HYPER_TRANSITION_MS < t) break;
    if (t <= h.end) f = Math.max(f, outQuint((t - h.start) / HYPER_TRANSITION_MS));
    else f = Math.max(f, 1 - outQuint((t - h.end) / HYPER_TRANSITION_MS));
  }
  return f;
}

function facingAt(path: readonly CatcherFrame[], t: number): number {
  const now = sampleCatcherX(path, t);
  for (const w of [24, 60, 140, 320]) {
    const dx = now - sampleCatcherX(path, t - w);
    if (dx > 2) return 1;
    if (dx < -2) return -1;
  }
  return 1;
}

function blitCatcher(
  ctx: CanvasRenderingContext2D,
  bitmap: ImageBitmap,
  centreX: number,
  topY: number,
  widthScreen: number,
  facing: number,
  extraTint: number,
): void {
  const dw = widthScreen;
  const dh = widthScreen * (bitmap.height / bitmap.width);
  ctx.save();
  ctx.translate(centreX, topY);
  ctx.scale(facing, 1);
  ctx.drawImage(bitmap, -dw / 2, 0, dw, dh);

  if (extraTint > 0.02) {
    ctx.globalAlpha *= extraTint;
    ctx.drawImage(redTinted(bitmap), -dw / 2, 0, dw, dh);
  }
  ctx.restore();
}

const _sortedCache = new WeakMap<CatchSession, readonly CatchObject[]>();
function sortedObjects(session: CatchSession): readonly CatchObject[] {
  let s = _sortedCache.get(session);
  if (s === undefined) {
    s = [...session.objects].sort((a, b) => a.startTime - b.startTime);
    _sortedCache.set(session, s);
  }
  return s;
}

function lastIndexAtOrBefore(objs: readonly CatchObject[], t: number): number {
  let lo = 0, hi = objs.length - 1, res = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (objs[mid]!.startTime <= t) { res = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return res;
}

function firstIndexAtOrAfter(objs: readonly CatchObject[], t: number): number {
  let lo = 0, hi = objs.length - 1, res = objs.length;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (objs[mid]!.startTime >= t) { res = mid; hi = mid - 1; } else lo = mid + 1;
  }
  return res;
}

const _flCache = new WeakMap<CatchSession, CatchFlashlight>();
function catchFlashlight(session: CatchSession): CatchFlashlight {
  let fl = _flCache.get(session);
  if (fl === undefined) {
    fl = new CatchFlashlight(session.beatmap, session.comboFrames, S);
    _flCache.set(session, fl);
  }
  return fl;
}

function drawCatcherAndFeedback(ctx: CanvasRenderingContext2D, session: CatchSession, timeMs: number): void {
  const cs = session.modDiff.cs;
  const path = session.catcherPath;
  const vs = visualState(session);
  const catcherX = sampleCatcherX(path, timeMs);
  const widthScreen = catcherVisualWidthOsu(cs) * S * CATCHER_SCALE;

  const old = isOldStyleCatcher(session.skin);
  const stem = old ? 'fruit-ryuuta' : 'fruit-catcher-idle';
  const dims = skinSprite(session.skin, stem);
  const idle = skinImg(session.skin, stem);
  const state = catcherStateAt(vs, timeMs);
  const body = old ? idle : (skinImg(session.skin, `fruit-catcher-${state}`) ?? idle);
  if (body === undefined || idle === undefined || dims === undefined) return;

  /** 盘沿在素材中的相对高度用于计算贴图顶部。 */

  const dh = widthScreen * (dims.logH / dims.logW);
  const topY = CATCH_LINE_Y - dh * (CATCHER_RIM_Y / dims.logH) + CATCHER_TOP_OFFSET;

  blitCatcher(ctx, body, screenX(catcherX), topY, widthScreen, facingAt(path, timeMs),
    hyperFactorAt(vs, timeMs));

}

export function drawCatchPlayfield(ctx: CanvasRenderingContext2D, session: CatchSession, timeMs: number, options: RenderOptions): void {
  const { modDiff } = session;
  const fallMs = fallTimeMs(modDiff.ar);

  const objs = sortedObjects(session);
  const lo = firstIndexAtOrAfter(objs, timeMs);
  const hi = lastIndexAtOrBefore(objs, timeMs + fallMs);

  for (let i = hi; i >= lo; i--) {
    const obj = objs[i]!;
    const frac = (obj.startTime - timeMs) / fallMs;
    if (frac < 0 || frac > 1) continue;

    const hd = options.modHidden ? hdFadeAlpha(frac) : 1;
    if (hd <= 0) continue;
    ctx.globalAlpha = hd;
    const cy = screenYFromFrac(frac);
    const cx = screenX(obj.effectiveX);

    if (obj.type === 'banana') {
      if (!drawLegacyBanana(ctx, session, cx, cy, obj, frac)) drawBanana(ctx, cx, cy, obj, frac);
    } else if (obj.type === 'fruit') {
      if (!drawLegacyFruit(ctx, session, cx, cy, obj)) {
        drawFruit(ctx, cx, cy, obj, comboColorFor(session, obj.indexInBeatmap), frac, fallMs);
      }
    } else {
      if (!drawLegacyDroplet(ctx, session, cx, cy, obj, frac, fallMs)) {
        drawDroplet(ctx, cx, cy, obj, comboColorFor(session, obj.indexInBeatmap));
      }
    }
    ctx.globalAlpha = 1;
  }

  drawCatcherAndFeedback(ctx, session, timeMs);

  /** Flashlight 暗化游戏层，combo 和 HUD 保持明亮。 */

  if (options.modFlashlight) {
    const catcherX = sampleCatcherX(session.catcherPath, timeMs);
    catchFlashlight(session).draw(ctx, timeMs, screenX(catcherX), CATCH_LINE_Y);
  }

  const comboX = sampleCatcherX(session.catcherPath, timeMs);
  drawManiaCombo(ctx, session.comboFrames, timeMs, screenX(comboX), CATCH_LINE_Y - COMBO_CENTRE_ABOVE_LINE_OSU * S, session.skin);
}
