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
import type { ReplayData, ReplayFrame, SkinAssets } from '../types/index';

// Per-replay cumulative-time cache; WeakMap keeps it GC-safe.
const _cumTimes = new WeakMap<ReplayFrame[], number[]>();

function getCumulativeTimes(frames: ReplayFrame[]): number[] {
  let times = _cumTimes.get(frames);
  if (times === undefined) {
    times = new Array<number>(frames.length);
    let acc = 0;
    for (let i = 0; i < frames.length; i++) {
      acc += frames[i]!.timeDelta;
      times[i] = acc;
    }
    _cumTimes.set(frames, times);
  }
  return times;
}

const TRAIL_LENGTH = 10;
const CURSOR_RADIUS = 6; // primitive fallback only

// Must match HitObjectRenderer.
const SCALE = Math.min(800 / 512, 600 / 384) * 0.9;
const OFFSET_X = (1280 - 512 * SCALE) / 2;
const OFFSET_Y = (720 - 384 * SCALE) / 2;

// osu! draws every cursor-system sprite (cursor, cursormiddle, cursortrail) at
// "screen scale": each sprite's native @2x-adjusted size with the playfield's
// 1.6 "stable magic ratio" undone (NonPlayfieldSprite + LegacyCursorTrail both
// apply Texture.ScaleAdjust *= 1.6). In our osu-px→canvas space that is
// native/1.6 osu-px, then ×SCALE to canvas px. The shared factor means cursor
// and trail scale together, so the trail is only smaller when its texture is.
const CURSOR_PX_PER_NATIVE = SCALE / 1.6;

function toCanvas(x: number, y: number): [number, number] {
  return [OFFSET_X + x * SCALE, OFFSET_Y + y * SCALE];
}

type ResolvedSprite = { bmp: ImageBitmap; scale: number };

// @2x preferred; reports the native scale-divisor (2 for @2x, 1 for SD). A 1×1
// bitmap is osu!'s "suppressed element" convention, so it resolves to undefined.
function resolveCursorSprite(
  images: Map<string, ImageBitmap>,
  stem: string
): ResolvedSprite | undefined {
  const hd = images.get(`${stem}@2x.png`);
  if (hd) return hd.width <= 1 && hd.height <= 1 ? undefined : { bmp: hd, scale: 2 };
  const sd = images.get(`${stem}.png`);
  if (sd) return sd.width <= 1 && sd.height <= 1 ? undefined : { bmp: sd, scale: 1 };
  return undefined;
}

// Draw a cursor-system sprite centered at (cx, cy) at its native @2x-adjusted
// size; aspect preserved for non-square art.
function drawSprite(
  ctx: CanvasRenderingContext2D,
  s: ResolvedSprite,
  cx: number,
  cy: number
): void {
  const w = (s.bmp.width / s.scale) * CURSOR_PX_PER_NATIVE;
  const h = (s.bmp.height / s.scale) * CURSOR_PX_PER_NATIVE;
  ctx.drawImage(s.bmp, cx - w / 2, cy - h / 2, w, h);
}

function findFrameIndex(times: number[], timeMs: number): number {
  if (times.length === 0) return -1;
  if (timeMs < times[0]!) return -1;
  if (timeMs >= times[times.length - 1]!) return times.length - 1;

  let lo = 0;
  let hi = times.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (times[mid]! <= timeMs) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

function interpolateCursor(
  frames: ReplayFrame[],
  times: number[],
  timeMs: number
): [number, number] {
  const idx = findFrameIndex(times, timeMs);

  if (idx < 0) {
    const f = frames[0]!;
    return toCanvas(f.x, f.y);
  }

  if (idx >= frames.length - 1) {
    const f = frames[frames.length - 1]!;
    return toCanvas(f.x, f.y);
  }

  const t0 = times[idx]!;
  const t1 = times[idx + 1]!;
  const dt = t1 - t0;
  const frac = dt < 1e-6 ? 0 : (timeMs - t0) / dt;

  const f0 = frames[idx]!;
  const f1 = frames[idx + 1]!;
  const x = f0.x + (f1.x - f0.x) * frac;
  const y = f0.y + (f1.y - f0.y) * frac;
  return toCanvas(x, y);
}

/**
 * Draw the replay cursor (interpolated between replay frames) and its trail at `timeMs`
 * (beatmap ms). Uses the skin's cursor/cursormiddle/cursortrail sprites at osu!'s
 * screen-scale sizing; falls back to primitive circles only when no skin is supplied.
 * `ctx` is in logical 1280×720 coords; replay frames are osu!pixels.
 */
export function drawCursor(
  ctx: CanvasRenderingContext2D,
  replay: ReplayData,
  timeMs: number,
  skin?: SkinAssets
): void {
  const { frames } = replay;
  if (frames.length === 0) return;

  const times = getCumulativeTimes(frames);
  const idx = findFrameIndex(times, timeMs);
  if (idx < 0) return;

  const trailStart = Math.max(0, idx - TRAIL_LENGTH + 1);
  const trail = skin ? resolveCursorSprite(skin.images, 'cursortrail') : undefined;

  // The primitive pink trail is only for the no-skin case. A loaded skin that
  // suppresses (1×1) or omits cursortrail shows no trail at all — never the dev
  // primitive over a real skin (e.g. YUGEN ships a 1×1 cursortrail = no trail).
  if (trail || !skin) {
    for (let i = idx; i >= trailStart; i--) {
      const age = idx - i;
      const alpha = 1 - age / TRAIL_LENGTH;
      const [tx, ty] = toCanvas(frames[i]!.x, frames[i]!.y);

      ctx.save();
      if (trail) {
        ctx.globalAlpha = alpha * 0.7;
        drawSprite(ctx, trail, tx, ty);
      } else {
        ctx.globalAlpha = alpha * 0.55;
        ctx.beginPath();
        ctx.arc(tx, ty, CURSOR_RADIUS * (1 - age / (TRAIL_LENGTH * 1.5)), 0, Math.PI * 2);
        ctx.fillStyle = '#e879a0';
        ctx.fill();
      }
      ctx.restore();
    }
  }

  const [cx, cy] = interpolateCursor(frames, times, timeMs);
  const cursor = skin ? resolveCursorSprite(skin.images, 'cursor') : undefined;
  // cursormiddle layers above cursor; many skins put the real cursor art here.
  const cursorMiddle = skin ? resolveCursorSprite(skin.images, 'cursormiddle') : undefined;

  if (cursor || cursorMiddle) {
    if (cursor) drawSprite(ctx, cursor, cx, cy);
    if (cursorMiddle) drawSprite(ctx, cursorMiddle, cx, cy);
    return;
  }

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, CURSOR_RADIUS + 4, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(232, 121, 160, 0.4)';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, CURSOR_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = '#e879a0';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, CURSOR_RADIUS * 0.4, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.restore();
}
