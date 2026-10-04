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
/** 用 source-over 绘制黑色光罩；destination-out 会擦除底层游戏像素。 */

const DISC_SIZE = 1024;
const GRADIENT_STEPS = 8;

const _discCache = new Map<number, OffscreenCanvas>();

function getRevealDisc(innerRatio: number): OffscreenCanvas {
  const cached = _discCache.get(innerRatio);
  if (cached !== undefined) return cached;

  const osc = new OffscreenCanvas(DISC_SIZE, DISC_SIZE);
  const c = osc.getContext('2d')!;
  const half = DISC_SIZE / 2;
  const grad = c.createRadialGradient(half, half, 0, half, half, half);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(innerRatio, 'rgba(0,0,0,0)');
  for (let i = 1; i < GRADIENT_STEPS; i++) {
    const u = i / GRADIENT_STEPS;
    const s = u * u * (3 - 2 * u); /** smoothstep 渐变。 */
    const r = innerRatio + u * (1 - innerRatio);
    grad.addColorStop(Math.min(1, r), `rgba(0,0,0,${s.toFixed(4)})`);
  }
  grad.addColorStop(1, 'rgba(0,0,0,1)');
  c.fillStyle = grad;
  c.fillRect(0, 0, DISC_SIZE, DISC_SIZE);

  _discCache.set(innerRatio, osc);
  return osc;
}

export function drawFlashlightReveal(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  outerR: number, innerRatio: number,
  x: number, y: number, w: number, h: number,
): void {
  const disc = getRevealDisc(innerRatio);
  const dx = cx - outerR;
  const dy = cy - outerR;
  const d  = outerR * 2;

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#000';

  ctx.fillRect(x, y, Math.max(0, dx - x), h);
  ctx.fillRect(dx + d, y, Math.max(0, x + w - (dx + d)), h);
  ctx.fillRect(dx, y, d, Math.max(0, dy - y));
  ctx.fillRect(dx, dy + d, d, Math.max(0, y + h - (dy + d)));
  ctx.drawImage(disc, dx, dy, d, d);
  ctx.restore();
}
