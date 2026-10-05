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
import type { HitResult, SkinAssets } from '../types/index';

const SYSTEM_UI_FONT = 'system-ui, "Segoe UI", "PingFang SC", "Microsoft YaHei UI", sans-serif';
const COMBO_ANIM_MS = 250;

export interface ComboFrame {
  time:  number;
  combo: number;
}

/** 尾部失误不打断 combo；comboBreak 才清零。 */
export function computeComboTimeline(results: readonly HitResult[]): ComboFrame[] {
  const sorted = [...results].sort((a, b) => a.time - b.time);

  const frames: ComboFrame[] = [];
  let combo = 0;

  for (const r of sorted) {
    if (r.comboIgnore) continue;
    if (r.comboBreak) combo = 0;
    if (r.judgement > 0 && !r.comboBreak) combo++;
    frames.push({ time: r.time, combo });
  }

  return frames;
}

function findBefore(frames: readonly { time: number }[], timeMs: number): number {
  if (frames.length === 0 || timeMs < frames[0]!.time) return -1;
  if (timeMs >= frames[frames.length - 1]!.time) return frames.length - 1;
  let lo = 0, hi = frames.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (frames[mid]!.time <= timeMs) lo = mid; else hi = mid - 1;
  }
  return lo;
}

const SCORE_GLYPH_SUFFIX: Record<string, string> = {
  '0': '0', '1': '1', '2': '2', '3': '3', '4': '4',
  '5': '5', '6': '6', '7': '7', '8': '8', '9': '9',
  '.': 'dot', '%': 'percent', 'x': 'x',
};

/** 目标尺寸超过 1× 位图才选 @2x，避免小字过度缩小后变模糊。 */
function glyphImage(
  images: Map<string, ImageBitmap>,
  prefix: string,
  ch: string,
  targetPx?: number,
): ImageBitmap | undefined {
  const suffix = SCORE_GLYPH_SUFFIX[ch];
  if (suffix === undefined) return undefined;
  const hi = images.get(`${prefix}-${suffix}@2x.png`);
  const lo = images.get(`${prefix}-${suffix}.png`);
  if (hi === undefined) return lo;
  if (lo === undefined || targetPx === undefined) return hi;
  return targetPx > lo.height ? hi : lo;
}

const _glyphAspectCache = new WeakMap<SkinAssets, Map<string, Map<string, number>>>();

function glyphAspect(skin: SkinAssets | undefined, prefix: string, ch: string): number {
  if (skin === undefined) return 0.65;
  let byPrefix = _glyphAspectCache.get(skin);
  if (byPrefix === undefined) {
    byPrefix = new Map();
    _glyphAspectCache.set(skin, byPrefix);
  }
  let byChar = byPrefix.get(prefix);
  if (byChar === undefined) {
    byChar = new Map();
    byPrefix.set(prefix, byChar);
  }
  let aspect = byChar.get(ch);
  if (aspect === undefined) {
    const bmp = glyphImage(skin.images, prefix, ch);
    aspect = bmp !== undefined ? bmp.width / bmp.height : 0.65;
    byChar.set(ch, aspect);
  }
  return aspect;
}

function drawScoreText(
  ctx: CanvasRenderingContext2D,
  text: string,
  rightX: number,
  y: number,
  digitH: number,
  prefix: string,
  skin?: SkinAssets
): void {
  let totalW = 0;
  for (let i = 0; i < text.length; i++) {
    totalW += glyphAspect(skin, prefix, text.charAt(i)) * digitH;
  }

  const scale    = (typeof ctx.getTransform === 'function' ? ctx.getTransform().a : 1) || 1;
  const targetPx = digitH * scale;

  let x = rightX - totalW;

  for (let i = 0; i < text.length; i++) {
    const ch  = text.charAt(i);
    const w   = glyphAspect(skin, prefix, ch) * digitH;
    const bmp = skin ? glyphImage(skin.images, prefix, ch, targetPx) : undefined;

    if (bmp) {
      ctx.drawImage(bmp, x, y, w, digitH);
    } else {
      ctx.save();
      ctx.font         = `bold ${Math.round(digitH * 0.85)}px ${SYSTEM_UI_FONT}`;
      ctx.textAlign    = 'left';
      ctx.textBaseline = 'top';
      ctx.strokeStyle  = 'rgba(0,0,0,0.75)';
      ctx.lineWidth    = 2;
      ctx.strokeText(ch, x, y);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(ch, x, y);
      ctx.restore();
    }

    x += w;
  }
}

const MANIA_COMBO_DIGIT_H = 28;

function drawPopCombo(
  ctx: CanvasRenderingContext2D,
  comboFrames: readonly ComboFrame[],
  timeMs: number,
  suffix: string,
  digitH: number,
  skin: SkinAssets | undefined,
  anchor: (totalW: number) => { rightX: number; topY: number; cx: number; cy: number },
): void {
  const i     = findBefore(comboFrames, timeMs);
  const combo = i >= 0 ? comboFrames[i]!.combo : 0;
  if (combo === 0) return;

  const text        = String(combo) + suffix;
  const elapsed     = i >= 0 ? timeMs - comboFrames[i]!.time : COMBO_ANIM_MS;
  const comboPrefix = skin?.config.comboPrefix ?? 'score';

  let totalW = 0;
  for (let k = 0; k < text.length; k++) {
    totalW += glyphAspect(skin, comboPrefix, text.charAt(k)) * digitH;
  }
  const popScale = elapsed < COMBO_ANIM_MS ? 1 + 0.4 * (1 - elapsed / COMBO_ANIM_MS) : 1.0;
  const { rightX, topY, cx, cy } = anchor(totalW);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(popScale, popScale);
  ctx.translate(-cx, -cy);
  drawScoreText(ctx, text, rightX, topY, digitH, comboPrefix, skin);
  ctx.restore();
}

export function drawManiaCombo(
  ctx: CanvasRenderingContext2D,
  comboFrames: readonly ComboFrame[],
  timeMs: number,
  centerX: number,
  centerY: number,
  skin?: SkinAssets,
): void {
  drawPopCombo(ctx, comboFrames, timeMs, '', MANIA_COMBO_DIGIT_H, skin, (totalW) => ({
    rightX: centerX + totalW / 2,
    topY:   centerY - MANIA_COMBO_DIGIT_H / 2,
    cx:     centerX,
    cy:     centerY,
  }));
}
