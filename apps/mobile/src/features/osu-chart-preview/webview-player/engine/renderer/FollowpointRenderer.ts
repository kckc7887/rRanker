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
import type { BeatmapData, HitObject, SkinAssets } from '../types/index';
import type { ModDifficulty } from '../utils/modDifficulty';
import { sampleSlider } from './SliderGeometry';
import { slideDurationMs } from '../utils/sliderDuration';

// Must match HitObjectRenderer.
const PLAYFIELD_W = 512;
const PLAYFIELD_H = 384;
const CANVAS_W = 1280;
const CANVAS_H = 720;
const SCALE = Math.min(800 / PLAYFIELD_W, 600 / PLAYFIELD_H) * 0.9;
const OFFSET_X = (CANVAS_W - PLAYFIELD_W * SCALE) / 2;
const OFFSET_Y = (CANVAS_H - PLAYFIELD_H * SCALE) / 2;

function toCanvas(x: number, y: number): [cx: number, cy: number] {
  return [OFFSET_X + x * SCALE, OFFSET_Y + y * SCALE];
}





// Danser constants.
const PRE_EMPT      = 800;
const LINE_DIST     = 32;    // osu!pixels
const TRAIL_CAP     = 5000;
const HIT_FADE_IN   = 400;
const HIT_FADE_OUT  = 240;

interface FollowpointFrame {
  bitmap: ImageBitmap;
  is2x: boolean;
}

interface FollowpointArt {
  frames: FollowpointFrame[];
  frameDurMs: number;
}

const _artCache = new WeakMap<Map<string, ImageBitmap>, FollowpointArt | null>();

// Skips 1×1 placeholder images (skins use them to suppress engine defaults).
function resolveFollowpointArt(images: Map<string, ImageBitmap>): FollowpointArt | null {
  const cached = _artCache.get(images);
  if (cached !== undefined) return cached;

  const pickReal = (stem: string): FollowpointFrame | null => {
    const hd = images.get(`${stem}@2x.png`);
    if (hd && hd.width > 1) return { bitmap: hd, is2x: true };
    const sd = images.get(`${stem}.png`);
    if (sd && sd.width > 1) return { bitmap: sd, is2x: false };
    return null;
  };

  const frames: FollowpointFrame[] = [];
  for (let i = 0; ; i++) {
    const hasAny = images.has(`followpoint-${i}.png`) || images.has(`followpoint-${i}@2x.png`);
    if (!hasAny) break;
    const f = pickReal(`followpoint-${i}`);
    if (f !== null) frames.push(f);
  }

  let result: FollowpointArt | null = null;
  if (frames.length > 0) {
    result = { frames, frameDurMs: 1000 / frames.length };
  } else {
    const single = pickReal('followpoint');
    if (single !== null) result = { frames: [single], frameDurMs: 1000 };
  }

  _artCache.set(images, result);
  return result;
}

function startPosStacked(obj: HitObject, radiusOsu: number, flipY: (y: number) => number): { x: number; y: number } | null {
  if (obj.type === 'spinner') return null;
  const shift = -obj.stackHeight * radiusOsu / 10;
  return { x: obj.x + shift, y: flipY(obj.y) + shift };
}

// Slider end depends on slide parity: odd ends at tail, even ends back at head.
function endPosStacked(obj: HitObject, radiusOsu: number, flipY: (y: number) => number): { x: number; y: number } | null {
  if (obj.type === 'spinner') return null;
  if (obj.type === 'circle') {
    const shift = -obj.stackHeight * radiusOsu / 10;
    return { x: obj.x + shift, y: flipY(obj.y) + shift };
  }
  const path = sampleSlider(obj);
  const endPoint = (obj.slides % 2 === 1)
    ? path[path.length - 1]!
    : path[0]!;
  const shift = -obj.stackHeight * radiusOsu / 10;
  return { x: endPoint.x + shift, y: flipY(endPoint.y) + shift };
}

function objectEndTime(obj: HitObject, beatmap: BeatmapData): number {
  if (obj.type === 'slider') return obj.time + slideDurationMs(beatmap, obj) * obj.slides;
  if (obj.type === 'spinner') return obj.endTime;
  return obj.time;
}

/**
 * Draw followpoint trails between consecutive std hit objects at `timeMs` (beatmap ms).
 * Ported from danser: dots fade in/out along prev→next with a cascading wave; danser's
 * slide/scale animations are omitted. Trails are skipped across spinners, new combos,
 * and gaps shorter than 1.5 dot-spacings. `ctx` is in logical 1280×720 coords.
 */
export function drawFollowpoints(
  ctx: CanvasRenderingContext2D,
  beatmap: BeatmapData,
  skin: SkinAssets,
  timeMs: number,
  modDiff: ModDifficulty,
): void {
  const art = resolveFollowpointArt(skin.images);
  if (art === null) return;

  const radiusOsu   = modDiff.circleRadiusPx;
  const preempt     = modDiff.preemptMs;
  const fy = modDiff.isHR ? (y: number) => 384 - y : (y: number) => y;
  const arScale     = Math.min(1, preempt / 450);
  const timeFadeIn  = HIT_FADE_IN  * arScale;
  const timeFadeOut = HIT_FADE_OUT * arScale;

  const objects = beatmap.hitObjects;

  // Binary-search the visible window; iterating every pair dominates frame time on long maps.
  let firstIdx = 1;
  let lastIdx = objects.length - 1;
  if (objects.length > 1) {
    const minTime = timeMs - timeFadeOut;
    const maxTime = timeMs + preempt;
    let lo = 1;
    let hi = objects.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (objects[mid]!.time < minTime) lo = mid + 1;
      else hi = mid;
    }
    firstIdx = lo;
    if (firstIdx >= objects.length || objects[firstIdx]!.time > maxTime) {
      lastIdx = firstIdx - 1;
    } else {
      lo = firstIdx;
      hi = objects.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >>> 1;
        if (objects[mid]!.time <= maxTime) lo = mid;
        else hi = mid - 1;
      }
      lastIdx = lo;
    }
  }

  for (let i = firstIdx; i <= lastIdx; i++) {
    const prev = objects[i - 1]!;
    const next = objects[i]!;

    if (prev.type === 'spinner') continue;
    if (next.type === 'spinner') continue;
    if (next.newCombo) continue;

    const prevTime = objectEndTime(prev, beatmap);
    const nextTime = next.time;
    const duration = nextTime - prevTime;
    if (duration <= 0) continue;

    // Gate trail on `next` being visible (prevents trail appearing before it at high AR).
    const nextAppear = nextTime - preempt;

    if (timeMs < Math.max(prevTime - PRE_EMPT, nextAppear)) continue;
    if (timeMs > nextTime + timeFadeOut) continue;

    const prevPos = endPosStacked(prev, radiusOsu, fy);
    const nextPos = startPosStacked(next, radiusOsu, fy);
    if (prevPos === null || nextPos === null) continue;

    const dx = nextPos.x - prevPos.x;
    const dy = nextPos.y - prevPos.y;
    const distance = Math.hypot(dx, dy);
    if (distance < LINE_DIST * 1.5) continue;

    const rotation = Math.atan2(dy, dx);

    // bitmap × CircleRadius/64 × SCALE; @2x bitmaps halved later.
    const sizeFactor = (radiusOsu / 64) * SCALE;

    const startProgress = Math.max(LINE_DIST * 1.5, distance - TRAIL_CAP);
    const endProgress   = distance - LINE_DIST;

    for (let progress = startProgress; progress < endProgress; progress += LINE_DIST) {
      const t      = progress / distance;
      const tStart = Math.max(prevTime + t * duration - PRE_EMPT, nextAppear);
      const tEnd   = prevTime + t * duration;

      if (timeMs < tStart) continue;
      if (timeMs > tEnd + timeFadeOut) continue;

      let alpha: number;
      if (timeMs < tStart + timeFadeIn) {
        alpha = (timeMs - tStart) / timeFadeIn;
      } else if (timeMs <= tEnd) {
        alpha = 1;
      } else {
        alpha = 1 - (timeMs - tEnd) / timeFadeOut;
      }
      if (alpha <= 0) continue;

      const osuX = prevPos.x + dx * t;
      const osuY = prevPos.y + dy * t;
      const [cx, cy] = toCanvas(osuX, osuY);

      const frameIdx = art.frames.length === 1
        ? 0
        : Math.floor(timeMs / art.frameDurMs) % art.frames.length;
      const frame = art.frames[frameIdx]!;
      const bmpDiv = frame.is2x ? 2 : 1;
      const drawW = (frame.bitmap.width  / bmpDiv) * sizeFactor;
      const drawH = (frame.bitmap.height / bmpDiv) * sizeFactor;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(cx, cy);
      ctx.rotate(rotation);
      ctx.drawImage(frame.bitmap, -drawW / 2, -drawH / 2, drawW, drawH);
      ctx.restore();
    }
  }
}
