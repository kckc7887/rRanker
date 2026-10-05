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
import { drawFlatCircleFeedback } from "../../flat-feedback";
import { buildFlatSliderBody } from "../../flat-slider";
import type { BeatmapData, HitResult, Slider, Spinner, SkinAssets } from '../types/index';
import type { ModDifficulty } from '../utils/modDifficulty';
import { sampleSlider } from './SliderGeometry';
import { slideDurationMs } from '../utils/sliderDuration';
import { type SpinnerAngleData, getSpinnerStateAt, spinnerProgress } from '../utils/hitJudge';

const SYSTEM_UI_FONT = 'system-ui, "Segoe UI", "PingFang SC", "Microsoft YaHei UI", sans-serif';

const SPINNER_CENTER_X = 256;
const SPINNER_CENTER_Y = 192;

const PLAYFIELD_W = 512;
const PLAYFIELD_H = 384;
const CANVAS_W = 1280;
const CANVAS_H = 720;

/** 按 800×600 基准缩放，音符大小不随画布尺寸改变。 */
const SCALE = Math.min(800 / PLAYFIELD_W, 600 / PLAYFIELD_H) * 0.9;
const OFFSET_X = (CANVAS_W - PLAYFIELD_W * SCALE) / 2;
const OFFSET_Y = (CANVAS_H - PLAYFIELD_H * SCALE) / 2;

function toCanvas(x: number, y: number): [cx: number, cy: number] {
  return [OFFSET_X + x * SCALE, OFFSET_Y + y * SCALE];
}

/** osu! wiki 半径公式：r=(54.4-4.48×CS)×1.00041。 */

/** 圆形有效区域约占素材宽度的 0.922，绘制尺寸补偿透明边。 */

const _circleRatioCache = new WeakMap<ImageBitmap, number>();

function hitCircleRatio(bitmap: ImageBitmap): number {
  const cached = _circleRatioCache.get(bitmap);
  if (cached !== undefined) return cached;

  const size = 64;
  const osc = new OffscreenCanvas(size, size);
  const oc = osc.getContext('2d')!;
  oc.drawImage(bitmap, 0, 0, size, size);
  const { data } = oc.getImageData(0, 0, size, size);

  const half = size / 2;
  let maxR = 0;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if ((data[(y * size + x) * 4 + 3]!) > 64) {
        const dx = x + 0.5 - half;
        const dy = y + 0.5 - half;
        const r = Math.sqrt(dx * dx + dy * dy);
        if (r > maxR) maxR = r;
      }
    }
  }

  const ratio = Math.min(1.0, Math.max(0.5, maxR / half));
  _circleRatioCache.set(bitmap, ratio);
  return ratio;
}

/** Instafade 皮肤把圆形画进数字；圆形素材留空，数字消失即命中反馈。 */

const _isBlankCache = new WeakMap<ImageBitmap, boolean>();

/** 1×1 或全透明素材表示隐藏；透明度检测使用 32×32 采样。 */
export function isBlankImage(bitmap: ImageBitmap): boolean {
  const cached = _isBlankCache.get(bitmap);
  if (cached !== undefined) return cached;

  let blank: boolean;
  if (bitmap.width <= 1 || bitmap.height <= 1) {
    blank = true;
  } else {
    const size = 32;
    const osc = new OffscreenCanvas(size, size);
    const oc = osc.getContext('2d')!;
    oc.drawImage(bitmap, 0, 0, size, size);
    const { data } = oc.getImageData(0, 0, size, size);
    blank = true;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i]! > 64) { blank = false; break; }
    }
  }

  _isBlankCache.set(bitmap, blank);
  return blank;
}

/** 预热需要的位图，避免首帧 GPU 回读阻塞。 */
export function warmSkinCaches(skin: SkinAssets): void {
  const digitPrefix = `${skin.config.hitCirclePrefix.toLowerCase()}-`;
  for (const [key, bitmap] of skin.images) {
    const k = key.toLowerCase();
    if (k.startsWith('hitcircle') || k.startsWith('sliderstartcircle') || k.startsWith('pippidon')) {
      isBlankImage(bitmap);
    } else if (k.startsWith(digitPrefix)) {
      hitCircleRatio(bitmap);
      isBlankImage(bitmap);
    }
  }
}

function skinImg(images: Map<string, ImageBitmap>, stem: string): ImageBitmap | undefined {
  return images.get(`${stem}@2x.png`) ?? images.get(`${stem}.png`);
}

function skinImgScaled(
  images: Map<string, ImageBitmap>, stem: string,
): { bmp: ImageBitmap; scale: number } | undefined {
  const hd = images.get(`${stem}@2x.png`);
  if (hd !== undefined) return { bmp: hd, scale: 2 };
  const sd = images.get(`${stem}.png`);
  if (sd !== undefined) return { bmp: sd, scale: 1 };
  return undefined;
}

/** 皮肤以 128px 原生尺寸对应直径 2r，@2x 折半；不按非透明区域重新缩放。 */

const OBJECT_DIAMETER_PX = 128;
function canonicalDiameter(img: { bmp: ImageBitmap; scale: number }, radius: number): number {
  return (img.bmp.width / img.scale) / OBJECT_DIAMETER_PX * (2 * radius);
}

/** multiply 会污染透明区，需用 destination-in 恢复遮罩。 */

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

const _sliderPathsHR = new WeakMap<Slider, { x: number; y: number }[]>();

function getSliderPathForMod(slider: Slider, isHR: boolean): { x: number; y: number }[] {
  if (!isHR) return sampleSlider(slider);
  let path = _sliderPathsHR.get(slider);
  if (path === undefined) {
    const base = sampleSlider(slider);
    path = base.map(p => ({ x: p.x, y: 384 - p.y }));
    _sliderPathsHR.set(slider, path);
  }
  return path;
}

const EXPLOSION_FADE_DUR  = 240;
const EXPLOSION_TOTAL_DUR = EXPLOSION_FADE_DUR;

const DEFAULT_COMBO_COLORS = [
  '#e879a0',
  '#68b3f0',
  '#f7e04a',
  '#90e070',
  '#f08040',
];

/** 新 combo 按 1+comboSkip 推进颜色，spinner 不参与。 */
function buildComboIndices(beatmap: BeatmapData): number[] {
  const indices = new Array<number>(beatmap.hitObjects.length);
  let colorIndex = -1;

  for (let i = 0; i < beatmap.hitObjects.length; i++) {
    const obj = beatmap.hitObjects[i]!;
    const isNewCombo = obj.type !== 'spinner' && (i === 0 || obj.newCombo);
    const skip = obj.type !== 'spinner' ? obj.comboSkip : 0;

    if (isNewCombo) colorIndex += 1 + skip;
    indices[i] = Math.max(0, colorIndex);
  }

  return indices;
}

/** combo 数字从 1 开始，spinner 不编号。 */
function buildComboNumbers(beatmap: BeatmapData): number[] {
  const numbers = new Array<number>(beatmap.hitObjects.length);
  let current = 0;

  for (let i = 0; i < beatmap.hitObjects.length; i++) {
    const obj = beatmap.hitObjects[i]!;
    if (obj.type === 'spinner') {
      numbers[i] = 0;
      continue;
    }
    if (i === 0 || obj.newCombo) {
      current = 1;
    } else {
      current++;
    }
    numbers[i] = current;
  }

  return numbers;
}

const _comboCache = new WeakMap<BeatmapData, { indices: number[]; numbers: number[] }>();

function getComboData(beatmap: BeatmapData): { indices: number[]; numbers: number[] } {
  let cached = _comboCache.get(beatmap);
  if (cached === undefined) {
    cached = {
      indices: buildComboIndices(beatmap),
      numbers: buildComboNumbers(beatmap),
    };
    _comboCache.set(beatmap, cached);
  }
  return cached;
}

/** 可见窗口须覆盖滑条/转盘结束与淡出，不能只按起始时间截取。 */

const _maxObjectLifetimeCache = new WeakMap<BeatmapData, number>();

function getMaxObjectLifetime(beatmap: BeatmapData): number {
  const cached = _maxObjectLifetimeCache.get(beatmap);
  if (cached !== undefined) return cached;
  let max = 500;
  for (const obj of beatmap.hitObjects) {
    let life = 500;
    if (obj.type === 'slider') {
      life = slideDurationMs(beatmap, obj) * obj.slides + 500;
    } else if (obj.type === 'spinner') {
      life = obj.endTime - obj.time + 500;
    }
    if (life > max) max = life;
  }
  _maxObjectLifetimeCache.set(beatmap, max);
  return max;
}

const _hitCirclesCache = new WeakMap<readonly HitResult[], Set<number>>();

function getHitCirclesSet(hitResults: readonly HitResult[]): Set<number> {
  let cached = _hitCirclesCache.get(hitResults);
  if (cached === undefined) {
    cached = new Set<number>();
    for (const r of hitResults) {
      if (!r.isSliderSub && r.judgement > 0) cached.add(r.objectIndex);
    }
    _hitCirclesCache.set(hitResults, cached);
  }
  return cached;
}

function findVisibleRange(
  beatmap: BeatmapData,
  timeMs: number,
  preempt: number,
  maxLifetime: number,
): { firstIdx: number; lastIdx: number } {
  const objects = beatmap.hitObjects;
  const n = objects.length;
  if (n === 0) return { firstIdx: 0, lastIdx: -1 };

  const minTime = timeMs - maxLifetime;
  const maxTime = timeMs + preempt;

  let lo = 0;
  let hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (objects[mid]!.time < minTime) lo = mid + 1;
    else hi = mid;
  }
  const firstIdx = lo;
  if (firstIdx >= n || objects[firstIdx]!.time > maxTime) {
    return { firstIdx, lastIdx: firstIdx - 1 };
  }

  lo = firstIdx;
  hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    if (objects[mid]!.time <= maxTime) lo = mid;
    else hi = mid - 1;
  }
  return { firstIdx, lastIdx: lo };
}

function hdCircleAlpha(timeMs: number, appearTime: number, preempt: number): number {
  const fadeInEnd = appearTime + preempt * 0.4;
  const fadeOutEnd = appearTime + preempt * 0.7;
  if (timeMs < fadeInEnd) return (timeMs - appearTime) / (preempt * 0.4);
  if (timeMs < fadeOutEnd) return 1 - (timeMs - fadeInEnd) / (preempt * 0.3);
  return 0;
}

function hdSliderBodyAlpha(timeMs: number, appearTime: number, preempt: number, activeEnd: number): number {
  const fadeInEnd = appearTime + preempt * 0.4;
  if (timeMs < appearTime) return 0;
  if (timeMs < fadeInEnd) return (timeMs - appearTime) / (preempt * 0.4);
  if (timeMs >= activeEnd) return 0;
  const p = Math.min(1, (timeMs - fadeInEnd) / (activeEnd - fadeInEnd));
  return 1 - p * (2 - p);
}

interface Vis {
  index: number;
  color: string;
  alpha: number;
  slideDur: number;
  comboNumber: number;
  wasHit: boolean;
  bodyDepth: number;
  frontDepth: number;
}
const _visible: Vis[] = [];
const _bodyOrder: number[] = [];
const _frontOrder: number[] = [];

export function drawHitObjects(
  ctx: CanvasRenderingContext2D,
  beatmap: BeatmapData,
  skin: SkinAssets,
  timeMs: number,
  hitResults: readonly HitResult[] = [],
  spinnerAngles: Map<number, SpinnerAngleData> = new Map(),
  modDiff: ModDifficulty,
  qualityTotal = 1,
): void {
  const preempt = modDiff.preemptMs;
  const fadeIn  = modDiff.fadeInMs;
  const radius  = modDiff.circleRadiusPx * SCALE;

  const fy = modDiff.isHR ? (y: number) => 384 - y : (y: number) => y;
  const isHD = modDiff.isHD;
  let firstObjIdx = 0;
  if (isHD) {
    for (let j = 0; j < beatmap.hitObjects.length; j++) {
      if (beatmap.hitObjects[j]!.type !== 'spinner') { firstObjIdx = j; break; }
    }
  }

  const { beatLength: curBeatLen, tpTime: curTpTime } = getActiveTiming(beatmap.timingPoints, timeMs);

  const comboColors = skin.config.comboColors.length > 0
    ? skin.config.comboColors
    : DEFAULT_COMBO_COLORS;

  const { indices: comboIndices, numbers: comboNumbers } = getComboData(beatmap);

  const _instafadeHc  = skinImg(skin.images, 'hitcircle');
  const circleInstafade = _instafadeHc !== undefined && isBlankImage(_instafadeHc);
  const _instafadeSc  = skinImg(skin.images, 'sliderstartcircle');
  const sliderHeadInstafade = _instafadeSc !== undefined
    ? isBlankImage(_instafadeSc)
    : circleInstafade;

  const hitCircles = getHitCirclesSet(hitResults);

  const SLIDER_FADE = 240;
  const CIRCLE_FADE = 200;

  const w100 = modDiff.hitWindow100;
  const w50  = modDiff.hitWindow50;

  const visible = _visible;
  visible.length = 0;

  const { firstIdx, lastIdx } = findVisibleRange(
    beatmap,
    timeMs,
    preempt,
    getMaxObjectLifetime(beatmap),
  );

  for (let i = firstIdx; i <= lastIdx; i++) {
    const obj = beatmap.hitObjects[i]!;
    const color = comboColors[comboIndices[i]! % comboColors.length]!;

    const hitTime   = obj.time;
    const appearTime = hitTime - preempt;
    if (timeMs < appearTime) continue;

    const slideDur = obj.type === 'slider' ? slideDurationMs(beatmap, obj) : 0;

    const wasHit = (obj.type === 'circle' || obj.type === 'slider') && hitCircles.has(i);

    let disappearTime: number;
    if (isHD && obj.type === 'circle') {
      disappearTime = appearTime + preempt * 0.7;
    } else if (obj.type === 'slider') {
      disappearTime = hitTime + slideDur * obj.slides + SLIDER_FADE;
    } else if (obj.type === 'spinner') {
      disappearTime = obj.endTime + CIRCLE_FADE;
    } else if (wasHit) {
      disappearTime = hitTime + EXPLOSION_TOTAL_DUR;
    } else {
      disappearTime = hitTime + w50;
    }
    if (timeMs > disappearTime) continue;

    let alpha: number;
    if (isHD && obj.type === 'circle') {
      alpha = hdCircleAlpha(timeMs, appearTime, preempt);
    } else if (isHD && obj.type === 'slider') {
      if (timeMs <= hitTime + slideDur * obj.slides) {
        alpha = 1;
      } else {
        alpha = 1 - (timeMs - (hitTime + slideDur * obj.slides)) / SLIDER_FADE;
      }
    } else if (timeMs < hitTime) {
      const elapsed = timeMs - appearTime;
      alpha = Math.min(1, elapsed / Math.min(fadeIn, preempt));
    } else if (obj.type === 'slider' && timeMs <= hitTime + slideDur * obj.slides) {
      alpha = 1;
    } else if (obj.type === 'spinner' && timeMs <= obj.endTime) {
      alpha = 1;
    } else if (wasHit && obj.type === 'circle') {
      alpha = 1;
    } else {
      if (obj.type === 'circle') {
        /** stable 在 w100 后线性淡出，到 w50 已为透明。 */

        if (timeMs < hitTime + w100) {
          alpha = 1;
        } else {
          const fadeSpan = Math.max(1, w50 - w100);
          alpha = 1 - (timeMs - hitTime - w100) / fadeSpan;
        }
      } else {
        const activeEndMs = obj.type === 'slider' ? hitTime + slideDur * obj.slides : obj.endTime;
        const fadeDur = obj.type === 'slider' ? SLIDER_FADE : CIRCLE_FADE;
        alpha = 1 - (timeMs - activeEndMs) / fadeDur;
      }
    }

    const bodyDepth  = obj.type === 'slider' ? hitTime + slideDur * obj.slides : 0;
    const frontDepth = obj.type === 'spinner' ? Number.POSITIVE_INFINITY : hitTime;
    visible.push({
      index: i,
      color,
      alpha: Math.max(0, Math.min(1, alpha)),
      slideDur,
      comboNumber: comboNumbers[i]!,
      wasHit,
      bodyDepth,
      frontDepth,
    });
  }

  /** Danser 分层：滑条体按结束时间，前景按起始时间；较早音符盖住较晚音符。 */

  const bodyOrder  = _bodyOrder;
  const frontOrder = _frontOrder;
  bodyOrder.length  = 0;
  frontOrder.length = 0;
  for (let v = 0; v < visible.length; v++) {
    const obj = beatmap.hitObjects[visible[v]!.index]!;
    if (obj.type === 'slider') bodyOrder.push(v);
    frontOrder.push(v);
  }
  bodyOrder.sort((a, b) => visible[b]!.bodyDepth - visible[a]!.bodyDepth);
  frontOrder.sort((a, b) => visible[b]!.frontDepth - visible[a]!.frontDepth);

  for (const v of bodyOrder) {
    const { index, alpha, slideDur, color } = visible[v]!;
    const obj = beatmap.hitObjects[index]!;
    if (obj.type !== 'slider') continue;

    ctx.save();
    ctx.globalAlpha = alpha;
    const stackH = obj.stackHeight ?? 0;
    if (stackH !== 0) ctx.translate(-stackH * radius / 10, -stackH * radius / 10);

    const path = getSliderPathForMod(obj, modDiff.isHR);
    const activeStart = obj.time;
    const activeEnd   = obj.time + slideDur * obj.slides;

    if (isHD) {
      ctx.globalAlpha = Math.max(0, hdSliderBodyAlpha(timeMs, activeStart - preempt, preempt, activeEnd));
    }

    const trackColor = skin.config.sliderTrackOverride ?? color;
    drawSliderBody(ctx, obj, path, radius, skin.config.sliderBorder, trackColor, modDiff.isHR, qualityTotal);

    if (obj.slides > 1 && path.length >= 2) {
      const lookback = Math.min(4, path.length - 2);

      const tail    = path[path.length - 1]!;
      const tailRef = path[path.length - 1 - lookback]!;
      const [tx, ty] = toCanvas(tail.x, tail.y);

      if (shouldShowTailArrow(obj.slides, timeMs, activeStart, slideDur)) {
        const angle = Math.atan2(tailRef.y - tail.y, tailRef.x - tail.x);
        drawRepeatArrow(ctx, tx, ty, angle, radius, color, skin.images, timeMs, curTpTime, curBeatLen);
      }

      if (timeMs >= activeStart && shouldShowHeadArrow(obj.slides, timeMs, activeStart, slideDur)) {
        const headRef = path[lookback]!;
        const head    = path[0]!;
        const [hax, hay] = toCanvas(head.x, head.y);
        const angle = Math.atan2(headRef.y - head.y, headRef.x - head.x);
        drawRepeatArrow(ctx, hax, hay, angle, radius, color, skin.images, timeMs, curTpTime, curBeatLen);
      }
    }

    ctx.restore();
  }

  for (const v of frontOrder) {
    const { index, color, alpha, slideDur, comboNumber, wasHit } = visible[v]!;
    const obj = beatmap.hitObjects[index]!;

    ctx.save();
    ctx.globalAlpha = alpha;

    const stackH = obj.type !== 'spinner' ? (obj.stackHeight ?? 0) : 0;
    if (stackH !== 0) {
      ctx.translate(-stackH * radius / 10, -stackH * radius / 10);
    }

    if (obj.type === 'circle') {
      const [cx, cy] = toCanvas(obj.x, fy(obj.y));

      if (isHD) {
        if (alpha > 0) {
          drawCircle(ctx, cx, cy, radius, color, skin.images);
          drawComboNumber(ctx, cx, cy, radius, comboNumber, skin, circleInstafade);
          if (timeMs < obj.time && index === firstObjIdx) {
            const t = (obj.time - timeMs) / preempt;
            drawApproachCircle(ctx, cx, cy, radius * (1 + 2 * t), color, skin.images);
          }
        }
      } else if (wasHit && timeMs >= obj.time) {
        const dt = timeMs - obj.time;
        const explosionAlpha = Math.max(0, 1 - dt / EXPLOSION_FADE_DUR);
        ctx.globalAlpha = explosionAlpha;
        drawCircleHitExplosion(ctx, cx, cy, radius, color, skin.images, dt);
      } else {
        drawCircle(ctx, cx, cy, radius, color, skin.images);
        /** 数字在命中时立即消失，保持 Instafade 效果。 */
        if (timeMs < obj.time) {
          drawComboNumber(ctx, cx, cy, radius, comboNumber, skin, circleInstafade);
          const t = (obj.time - timeMs) / preempt;
          drawApproachCircle(ctx, cx, cy, radius * (1 + 2 * t), color, skin.images);
        }
      }

    } else if (obj.type === 'slider') {
      const path = getSliderPathForMod(obj, modDiff.isHR);
      const [hx, hy] = toCanvas(obj.x, fy(obj.y));
      const activeStart = obj.time;
      const activeEnd   = obj.time + slideDur * obj.slides;

      if (timeMs < obj.time) {
        if (isHD) {
          const headAlpha = hdCircleAlpha(timeMs, obj.time - preempt, preempt);
          if (headAlpha > 0) {
            ctx.save();
            ctx.globalAlpha = headAlpha;
            drawSliderHeadCircle(ctx, hx, hy, radius, color, skin.images);
            drawComboNumber(ctx, hx, hy, radius, comboNumber, skin, sliderHeadInstafade);
            if (index === firstObjIdx) {
              const t = (obj.time - timeMs) / preempt;
              drawApproachCircle(ctx, hx, hy, radius * (1 + 2 * t), color, skin.images);
            }
            ctx.restore();
          }
        } else {
          drawSliderHeadCircle(ctx, hx, hy, radius, color, skin.images);
          drawComboNumber(ctx, hx, hy, radius, comboNumber, skin, sliderHeadInstafade);
          const t = (obj.time - timeMs) / preempt;
          drawApproachCircle(ctx, hx, hy, radius * (1 + 2 * t), color, skin.images);
        }
      }

      if (!isHD && wasHit && timeMs >= obj.time && timeMs < obj.time + EXPLOSION_TOTAL_DUR) {
        const dt = timeMs - obj.time;
        const explosionAlpha = Math.max(0, 1 - dt / EXPLOSION_FADE_DUR);
        ctx.save();
        ctx.globalAlpha = explosionAlpha;
        drawCircleHitExplosion(ctx, hx, hy, radius, color, skin.images, dt, true);
        ctx.restore();
      }

      if (timeMs >= activeStart && timeMs < activeEnd) {
        const slideProgress = (timeMs - activeStart) / slideDur;
        const slideIndex = Math.min(obj.slides - 1, Math.floor(slideProgress));
        let t = slideProgress - Math.floor(slideProgress);

        if (slideIndex % 2 === 1) t = 1 - t;
        t = Math.max(0, Math.min(1, t));

        const ballPos = pointAtFraction(path, t);
        const [bx, by] = toCanvas(ballPos.x, ballPos.y);
        drawSliderBall(ctx, bx, by, radius, color, skin.images, skin.config.allowSliderBallTint);
      }

    } else if (obj.type === 'spinner') {
      const angleData = spinnerAngles.get(index);
      const { cumAngle, absAngle } = angleData
        ? getSpinnerStateAt(angleData, timeMs)
        : { cumAngle: 0, absAngle: 0 };
      const duration = obj.endTime - obj.time;
      const progress = spinnerProgress(modDiff.od, duration, absAngle, modDiff.isLazer);
      drawSpinner(ctx, skin.spinnerImages, timeMs, obj, cumAngle, progress, progress >= 1, skin, angleData?.bonusTimes ?? []);
    }

    ctx.restore();
  }
}

function drawCircle(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  radius: number,
  color: string,
  images: Map<string, ImageBitmap>
): void {
  const hitcircle = skinImgScaled(images, 'hitcircle');
  const overlay   = skinImgScaled(images, 'hitcircleoverlay');

  if (hitcircle) {

    if (isBlankImage(hitcircle.bmp)) return;
    const d = canonicalDiameter(hitcircle, radius);
    ctx.drawImage(tintBitmap(hitcircle.bmp, color), cx - d / 2, cy - d / 2, d, d);
    /** 1×1 overlay 表示隐藏，不能拉伸成灰框。 */

    if (overlay && !isBlankImage(overlay.bmp)) {
      const od = canonicalDiameter(overlay, radius);
      ctx.drawImage(overlay.bmp, cx - od / 2, cy - od / 2, od, od);
    }
    return;
  }

  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, radius - 2, 0, Math.PI * 2);
  ctx.fillStyle = hexToRgba(color, 0.25);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.15, 0, Math.PI * 2);
  ctx.fillStyle = hexToRgba('#ffffff', 0.6);
  ctx.fill();
}

/** 有 sliderstartcircle 时只用专属 overlay。 */
function drawSliderHeadCircle(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  radius: number,
  color: string,
  images: Map<string, ImageBitmap>
): void {
  const startCircle  = skinImgScaled(images, 'sliderstartcircle');
  const startOverlay = skinImgScaled(images, 'sliderstartcircleoverlay');
  const hitcircle    = skinImgScaled(images, 'hitcircle');
  const hitOverlay   = skinImgScaled(images, 'hitcircleoverlay');

  const base    = startCircle ?? hitcircle;
  const overlay = startCircle ? startOverlay : hitOverlay;

  if (base) {
    if (isBlankImage(base.bmp)) return;
    const d = canonicalDiameter(base, radius);
    ctx.drawImage(tintBitmap(base.bmp, color), cx - d / 2, cy - d / 2, d, d);
    if (overlay && !isBlankImage(overlay.bmp)) {
      const od = canonicalDiameter(overlay, radius);
      ctx.drawImage(overlay.bmp, cx - od / 2, cy - od / 2, od, od);
    }
    return;
  }

  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, radius - 2, 0, Math.PI * 2);
  ctx.fillStyle = hexToRgba(color, 0.25);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.15, 0, Math.PI * 2);
  ctx.fillStyle = hexToRgba('#ffffff', 0.6);
  ctx.fill();
}

function drawCircleHitExplosion(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  radius: number,
  color: string,
  images: Map<string, ImageBitmap>,
  dt: number,
  isSliderHead = false,
): void {
  drawFlatCircleFeedback(ctx, cx, cy, radius, color, dt);
}

function drawApproachCircle(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  radius: number,
  color: string,
  images: Map<string, ImageBitmap>
): void {
  const approach = skinImgScaled(images, 'approachcircle');

  if (approach) {

    const d = canonicalDiameter(approach, radius);
    ctx.drawImage(tintBitmap(approach.bmp, color), cx - d / 2, cy - d / 2, d, d);
    return;
  }

  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();
}

/** 每条滑条缓存紧包围盒位图，避免 Firefox 每帧全画布滤镜开销。 */

interface CachedSliderBody {
  bmp: OffscreenCanvas;
  ox: number;        /** 位图左上角使用逻辑坐标。 */
  oy: number;
  w: number;         /** 绘制尺寸为逻辑尺寸，内部位图另乘 quality。 */
  h: number;
  radius: number;
  borderColor: string;
  trackColor: string;
  isHR: boolean;
  quality: number;
}
const _sliderBodyCache = new WeakMap<Slider, CachedSliderBody>();

/** 沿用 LegacyDrawableSliderPath：外侧 5/64 为阴影，边框与圆形 0.922r 对齐。 */

function buildSliderBody(
  path: { x: number; y: number }[],
  radius: number,
  borderColor: string,
  trackColor: string,
  quality: number,
): { bmp: OffscreenCanvas; ox: number; oy: number; w: number; h: number } | null {
  return buildFlatSliderBody(path, radius, borderColor, trackColor, quality, toCanvas);
}

function drawSliderBody(
  ctx: CanvasRenderingContext2D,
  slider: Slider,
  path: { x: number; y: number }[],
  radius: number,
  borderColor: string,
  trackColor: string,
  isHR: boolean,
  quality: number,
): void {
  let cached = _sliderBodyCache.get(slider);
  if (
    cached === undefined ||
    cached.radius !== radius ||
    cached.borderColor !== borderColor ||
    cached.trackColor !== trackColor ||
    cached.isHR !== isHR ||
    cached.quality !== quality
  ) {
    const built = buildSliderBody(path, radius, borderColor, trackColor, quality);
    if (built === null) return;
    cached = { ...built, radius, borderColor, trackColor, isHR, quality };
    _sliderBodyCache.set(slider, cached);
  }
  /** 高密度位图按逻辑尺寸回绘，每个 backing-store 像素对应约一个 texel。 */

  ctx.drawImage(cached.bmp, cached.ox, cached.oy, cached.w, cached.h);
}

/** 路径按弧长采样至约 1 点/像素，可直接按下标插值。 */
function pointAtFraction(
  path: { x: number; y: number }[],
  t: number
): { x: number; y: number } {
  if (path.length === 0) return { x: 0, y: 0 };
  if (t <= 0 || path.length === 1) return { ...path[0]! };
  if (t >= 1) return { ...path[path.length - 1]! };

  const idx = t * (path.length - 1);
  const lo  = Math.floor(idx);
  const hi  = Math.min(lo + 1, path.length - 1);
  const frac = idx - lo;
  return {
    x: path[lo]!.x + (path[hi]!.x - path[lo]!.x) * frac,
    y: path[lo]!.y + (path[hi]!.y - path[lo]!.y) * frac,
  };
}

export function shouldShowTailArrow(
  slides: number, timeMs: number,
  sliderStart: number, slideDur: number
): boolean {
  if (slides <= 1) return false;
  const edge = slideDur >= 0 ? 2 * Math.floor((slides - 2) / 2) + 1 : 1;
  return timeMs < sliderStart + slideDur * edge;
}

export function shouldShowHeadArrow(
  slides: number, timeMs: number,
  sliderStart: number, slideDur: number
): boolean {
  if (slides <= 2) return false;
  const edge = slideDur >= 0 ? 2 * Math.floor((slides - 1) / 2) : 2;
  return timeMs < sliderStart + slideDur * edge;
}

function drawSliderBall(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  radius: number,
  color: string,
  images: Map<string, ImageBitmap>,
  allowTint: boolean
): void {
  /** sliderfollowcircle 按皮肤原生尺寸绘制；1×1 表示隐藏。 */

  const follow = skinImgScaled(images, 'sliderfollowcircle');
  if (follow) {
    if (follow.bmp.width > 1) {
      const fd = canonicalDiameter(follow, radius);
      ctx.drawImage(follow.bmp, cx - fd / 2, cy - fd / 2, fd, fd);
    }
  } else {
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 2.2, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  const ball = skinImgScaled(images, 'sliderb') ?? skinImgScaled(images, 'sliderb0');
  if (ball) {
    const d = canonicalDiameter(ball, radius);
    const sprite = allowTint ? tintBitmap(ball.bmp, color) : ball.bmp;
    ctx.drawImage(sprite, cx - d / 2, cy - d / 2, d, d);
  } else {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.stroke();
  }
}

const _uninheritedCache = new WeakMap<BeatmapData['timingPoints'], BeatmapData['timingPoints']>();

function getUninheritedTimingPoints(
  timingPoints: BeatmapData['timingPoints']
): BeatmapData['timingPoints'] {
  let arr = _uninheritedCache.get(timingPoints);
  if (arr === undefined) {
    arr = timingPoints.filter(tp => !tp.inherited);
    _uninheritedCache.set(timingPoints, arr);
  }
  return arr;
}

function getActiveTiming(
  timingPoints: BeatmapData['timingPoints'],
  timeMs: number
): { beatLength: number; tpTime: number } {
  const arr = getUninheritedTimingPoints(timingPoints);
  if (arr.length === 0 || arr[0]!.time > timeMs) {
    return { beatLength: 500, tpTime: 0 };
  }
  let lo = 0;
  let hi = arr.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    if (arr[mid]!.time <= timeMs) lo = mid;
    else hi = mid - 1;
  }
  return { beatLength: arr[lo]!.beatLength, tpTime: arr[lo]!.time };
}

function drawRepeatArrow(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  angle: number,
  radius: number,
  color: string,
  images: Map<string, ImageBitmap>,
  timeMs: number,
  tpTime: number,
  beatLength: number
): void {
  const beatFrac = ((timeMs - tpTime) % beatLength + beatLength) % beatLength / beatLength;
  const pulseScale = 1.0 + 0.3 * (1.0 - beatFrac);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.scale(pulseScale, pulseScale);

  const arrow = skinImgScaled(images, 'reversearrow');
  if (arrow) {
    const size = canonicalDiameter(arrow, radius) / 2;
    ctx.drawImage(arrow.bmp, -size, -size, size * 2, size * 2);
  } else {
    const size = radius * 0.68;
    ctx.beginPath();
    ctx.moveTo(size,         0);
    ctx.lineTo(-size * 0.45,  size * 0.6);
    ctx.lineTo(-size * 0.15,  0);
    ctx.lineTo(-size * 0.45, -size * 0.6);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  ctx.restore();
}

function drawComboNumber(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  radius: number,
  number: number,
  skin: SkinAssets,
  instafade: boolean
): void {
  if (number <= 0) return;

  const digits = String(number).split('');
  const { images } = skin;
  const prefix = skin.config.hitCirclePrefix;
  const hitCircleOverlap = skin.config.hitCircleOverlap;

  const firstDigit = digits[0]!;
  const digitBitmaps = digits.map(d =>
    images.get(`${prefix}-${d}@2x.png`) ?? images.get(`${prefix}-${d}.png`)
  );

  if (digitBitmaps.every(b => b !== undefined)) {

    const hc = skinImgScaled(images, 'hitcircle');
    let scale: number;
    if (hc !== undefined && !isBlankImage(hc.bmp)) {
      const hcNativeW = hc.bmp.width / hc.scale;
      const hcDrawn = canonicalDiameter(hc, radius);
      scale = hcDrawn / hcNativeW;
    } else {
      /** 缺少 hitcircle 时，stable 按 128px 原生素材填满直径 2r。 */
      scale = (2 * radius) / 128;
    }

    const sdImg = images.get(`${prefix}-${firstDigit}.png`);
    const hdImg = images.get(`${prefix}-${firstDigit}@2x.png`);
    const nativeH = sdImg?.height ?? (hdImg !== undefined ? hdImg.height / 2 : digitBitmaps[0]!.height);

    /** Danser 圆内数字额外乘 0.8；HUD 与 Instafade 数字不使用该比例。 */

    const fontScale = 0.8 * scale;
    const targetH = instafade
      ? radius * 2 / hitCircleRatio(digitBitmaps[0]!)
      : nativeH * fontScale;

    const widths = digitBitmaps.map(b => b!.width * (targetH / b!.height));

    /** 数字间距使用 SD 像素，与字体尺寸按同一比例缩放。 */

    const scaledOverlap = instafade
      ? hitCircleOverlap * (targetH / nativeH)
      : hitCircleOverlap * fontScale;

    const advances = widths.map(w => w - scaledOverlap);

    const totalW = advances.slice(0, -1).reduce((s, a) => s + a, 0) + widths[widths.length - 1]!;

    let x = cx - totalW / 2;
    for (let i = 0; i < digitBitmaps.length; i++) {
      ctx.drawImage(digitBitmaps[i]!, x, cy - targetH / 2, widths[i]!, targetH);
      x += advances[i]!;
    }
  } else {
    const fontSize = Math.max(8, Math.round(radius * 0.9));
    ctx.font = `bold ${fontSize}px ${SYSTEM_UI_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(2, fontSize * 0.15);
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.strokeText(String(number), cx, cy);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(String(number), cx, cy);
  }
}

function drawSpinner(
  ctx: CanvasRenderingContext2D,
  images: Map<string, ImageBitmap>,
  timeMs: number,
  spinner: Spinner,
  cumAngle: number,
  progress: number,
  isCompleted: boolean,
  skin: SkinAssets,
  bonusTimes: readonly number[],
): void {
  const [cx, cy] = toCanvas(SPINNER_CENTER_X, SPINNER_CENTER_Y);

  /** 沿用 Danser：384/480×0.78=0.624，每个原生像素对应 0.624 逻辑像素。 */
  const SPINNER_SCALE = 0.624 * (CANVAS_H / 480);

  type Resolved = { bmp: ImageBitmap; scale: number };
  function resolve(stem: string): Resolved | undefined {
    const hd = images.get(`${stem}@2x.png`);
    if (hd && hd.width > 1) return { bmp: hd, scale: SPINNER_SCALE / 2 };
    const sd = images.get(`${stem}.png`);
    if (sd && sd.width > 1) return { bmp: sd, scale: SPINNER_SCALE };
    return undefined;
  }

  function drawAt(r: Resolved, ax: number, ay: number, rotation = 0, extraScale = 1): void {
    const w = r.bmp.width * r.scale * extraScale;
    const h = r.bmp.height * r.scale * extraScale;
    if (rotation !== 0) {
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(rotation);
      ctx.drawImage(r.bmp, -w / 2, -h / 2, w, h);
      ctx.restore();
    } else {
      ctx.drawImage(r.bmp, ax - w / 2, ay - h / 2, w, h);
    }
  }

  const completionScale = 0.8 + Math.min(1, progress) * 0.2;

  /** Danser 的 640×480 坐标中，背景中心位于 y=396.9。 */
  const bg = resolve('spinner-background');
  if (bg) drawAt(bg, CANVAS_W / 2, CANVAS_H * (396.9 / 480));

  const glow = resolve('spinner-glow');
  if (glow) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    drawAt(glow, cx, cy, 0, completionScale);
    ctx.restore();
  }

  const bottom = resolve('spinner-bottom');
  if (bottom) drawAt(bottom, cx, cy, cumAngle / 3, completionScale);

  const top = resolve('spinner-top');
  if (top) drawAt(top, cx, cy, cumAngle * 0.5, completionScale);

  const middle2 = resolve('spinner-middle2');
  if (middle2) drawAt(middle2, cx, cy, cumAngle, completionScale);

  const middle = resolve('spinner-middle');
  if (middle) {
    const t = Math.min(1, Math.max(0, (timeMs - spinner.time) / Math.max(1, spinner.endTime - spinner.time)));
    /** 量化为 32 档渐变，使着色位图可复用。 */

    const step = Math.round(t * 31);
    if (step > 0) {
      const chan = Math.round(255 * (1 - step / 31));
      const off = tintBitmap(middle.bmp, `rgb(255, ${chan}, ${chan})`);
      const w = middle.bmp.width * middle.scale * completionScale;
      const h = middle.bmp.height * middle.scale * completionScale;
      ctx.drawImage(off, cx - w / 2, cy - h / 2, w, h);
    } else {
      drawAt(middle, cx, cy, 0, completionScale);
    }
  }

  const circle = resolve('spinner-circle');
  if (circle) drawAt(circle, cx, cy, cumAngle, completionScale);

  const metre = resolve('spinner-metre');
  if (metre && progress > 0) {
    const w = metre.bmp.width * metre.scale;
    const h = metre.bmp.height * metre.scale;
    const x = cx - w / 2;
    const y = cy - h / 2;
    const clipH = h * Math.min(1, progress);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y + h - clipH, w, clipH);
    ctx.clip();
    ctx.drawImage(metre.bmp, x, y, w, h);
    ctx.restore();
  }

  if (timeMs < spinner.endTime) {
    const dur = Math.max(1, spinner.endTime - spinner.time);
    const elapsed = Math.max(0, timeMs - spinner.time);
    const t = Math.min(1, elapsed / dur);
    const acScale = 1.9 - 1.8 * t;
    const ac = resolve('spinner-approachcircle');
    if (ac) drawAt(ac, cx, cy, 0, acScale);
  }

  if (isCompleted) {
    const clear = resolve('spinner-clear');
    if (clear) drawAt(clear, CANVAS_W / 2, CANVAS_H * (230 / 768));
  } else if (timeMs >= spinner.time) {
    const spin = resolve('spinner-spin');
    if (spin) drawAt(spin, CANVAS_W / 2, CANVAS_H * (582 / 768));
  }

  /** 沿用 spinner 每转 1000 分的累计奖励显示。 */

  if (bonusTimes.length > 0) {
    let count = 0;
    for (let i = 0; i < bonusTimes.length; i++) {
      if (bonusTimes[i]! <= timeMs) count++; else break;
    }
    const age = count > 0 ? timeMs - bonusTimes[count - 1]! : Infinity;
    const BONUS_FADE_MS = 800, BONUS_SCALE_MS = 1000;
    if (count > 0 && age < BONUS_FADE_MS) {
      const alpha = 1 - age / BONUS_FADE_MS;
      const scale = 1 + 0.5 * Math.pow(1 - Math.min(1, age / BONUS_SCALE_MS), 5);
      /** lazer 奖励分位于转盘中心下方 80 个 legacy 单位。 */

      const bonusY = cy + 80 * (CANVAS_H / 480);
      drawSpinnerBonusNumber(ctx, skin, cx, bonusY, count * 1000, alpha, scale);
    }
  }
}

function drawSpinnerBonusNumber(
  ctx: CanvasRenderingContext2D,
  skin: SkinAssets,
  cx: number,
  cy: number,
  value: number,
  alpha: number,
  scale: number,
): void {
  const prefix = skin.config.scorePrefix || 'score';
  const text = String(value);
  const digitH = CANVAS_H * 0.05 * scale;
  const glyph = (ch: string) =>
    skin.images.get(`${prefix}-${ch}@2x.png`) ?? skin.images.get(`${prefix}-${ch}.png`);

  const widths: number[] = [];
  let totalW = 0;
  for (const ch of text) {
    const bmp = glyph(ch);
    const w = bmp ? (bmp.width / bmp.height) * digitH : digitH * 0.55;
    widths.push(w);
    totalW += w;
  }

  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  let x = cx - totalW / 2;
  const y = cy - digitH / 2;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charAt(i);
    const bmp = glyph(ch);
    const w = widths[i]!;
    if (bmp) {
      ctx.drawImage(bmp, x, y, w, digitH);
    } else {
      ctx.font = `bold ${Math.round(digitH * 0.9)}px ${SYSTEM_UI_FONT}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(ch, x, y);
    }
    x += w;
  }
  ctx.restore();
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
