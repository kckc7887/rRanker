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

// osu! replay sets M1 (1) whenever K1 (4) fires (and M2/K2); `exclude` suppresses
// the mouse-key lighting up on every keyboard hit.
const SYSTEM_UI_FONT = 'system-ui, "Segoe UI", "PingFang SC", "Microsoft YaHei UI", sans-serif';

const KEY_DEFS = [
  { bit: 4, exclude: 0, pressedColor: '#ffde00' },
  { bit: 8, exclude: 0, pressedColor: '#ffde00' },
  { bit: 1, exclude: 4, pressedColor: '#f8009e' },
  { bit: 2, exclude: 8, pressedColor: '#f8009e' },
] as const;

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

// scaleAt/tintAt are interpolated values right before this event applies; lets
// release-mid-press-ramp resume animation cleanly without main-loop state.
interface KeyEvent {
  time: number;
  isPress: boolean;
  scaleAt: number;
  tintAt: number;
}

type KeyTimelines = [KeyEvent[], KeyEvent[], KeyEvent[], KeyEvent[]];

const _timelines = new WeakMap<ReplayFrame[], KeyTimelines>();
const _pressCounts = new WeakMap<ReplayFrame[], [number[], number[], number[], number[]]>();

const PRESS_ANIM_MS = 100;

function outQuad(t: number): number {
  const u = 1 - t;
  return 1 - u * u;
}

// Generic press-timeline builder shared by std (4 keys from the replay button bitmask) and
// catch (3 keys from the catcher path). For each key it records inactive↔active transitions as
// KeyEvents carrying the interpolated scale/tint at the transition instant, plus a running
// cumulative press count per frame. `activeAt(frameIdx, keyIdx)` is the per-key active test.
function buildKeyTimelines(
  times: readonly number[],
  keyCount: number,
  activeAt: (frameIdx: number, keyIdx: number) => boolean,
): { timelines: KeyEvent[][]; counts: number[][] } {
  const n = times.length;
  const timelines: KeyEvent[][] = [];
  const counts: number[][] = [];
  for (let k = 0; k < keyCount; k++) {
    timelines.push([]);
    counts.push(new Array<number>(n));
  }

  const running = new Array<number>(keyCount).fill(0);
  const prev = new Array<boolean>(keyCount).fill(false);

  for (let i = 0; i < n; i++) {
    const t = times[i]!;
    for (let k = 0; k < keyCount; k++) {
      const wasActive = prev[k]!;
      const isActive  = activeAt(i, k);

      if (wasActive !== isActive) {
        const tl = timelines[k]!;
        const p = tl.length > 0 ? tl[tl.length - 1]! : null;
        let scaleAt = 1.0;
        let tintAt = 0.0;
        if (p !== null) {
          const u = Math.min(1, (t - p.time) / PRESS_ANIM_MS);
          const e = outQuad(u);
          const targetScale = p.isPress ? 0.8 : 1.0;
          const targetTint  = p.isPress ? 1.0 : 0.0;
          scaleAt = p.scaleAt + (targetScale - p.scaleAt) * e;
          tintAt  = p.tintAt  + (targetTint  - p.tintAt)  * e;
        }
        tl.push({ time: t, isPress: isActive, scaleAt, tintAt });
      }

      if (!wasActive && isActive) running[k] = running[k]! + 1;
      counts[k]![i] = running[k]!;
      prev[k] = isActive;
    }
  }

  return { timelines, counts };
}

function buildTimelines(frames: ReplayFrame[]): {
  timelines: KeyTimelines;
  counts: [number[], number[], number[], number[]];
} {
  const times = getCumulativeTimes(frames);
  const { timelines, counts } = buildKeyTimelines(times, KEY_DEFS.length, (i, k) => {
    const def = KEY_DEFS[k]!;
    const keys = frames[i]!.keys;
    return (keys & def.bit) !== 0 && (keys & def.exclude) === 0;
  });
  return {
    timelines: timelines as KeyTimelines,
    counts: counts as [number[], number[], number[], number[]],
  };
}

function getTimelines(frames: ReplayFrame[]): KeyTimelines {
  let tl = _timelines.get(frames);
  if (tl === undefined) {
    const built = buildTimelines(frames);
    _timelines.set(frames, built.timelines);
    _pressCounts.set(frames, built.counts);
    tl = built.timelines;
  }
  return tl;
}

function getPressCounts(frames: ReplayFrame[]): [number[], number[], number[], number[]] {
  let c = _pressCounts.get(frames);
  if (c === undefined) {
    const built = buildTimelines(frames);
    _timelines.set(frames, built.timelines);
    _pressCounts.set(frames, built.counts);
    c = built.counts;
  }
  return c;
}

function findEventBefore(events: KeyEvent[], timeMs: number): number {
  if (events.length === 0 || timeMs < events[0]!.time) return -1;
  if (timeMs >= events[events.length - 1]!.time) return events.length - 1;
  let lo = 0, hi = events.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (events[mid]!.time <= timeMs) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

function computeKeyState(
  events: KeyEvent[],
  timeMs: number,
): { pressed: boolean; scale: number; tint: number } {
  const idx = findEventBefore(events, timeMs);
  if (idx < 0) return { pressed: false, scale: 1.0, tint: 0.0 };
  const ev = events[idx]!;
  const u = Math.min(1, (timeMs - ev.time) / PRESS_ANIM_MS);
  const e = outQuad(u);
  const targetScale = ev.isPress ? 0.8 : 1.0;
  const targetTint  = ev.isPress ? 1.0 : 0.0;
  return {
    pressed: ev.isPress,
    scale: ev.scaleAt + (targetScale - ev.scaleAt) * e,
    tint:  ev.tintAt  + (targetTint  - ev.tintAt)  * e,
  };
}

// `div` divides @2x dimensions to native-1x for virtual-space layout.
function skinAsset(
  images: Map<string, ImageBitmap> | undefined,
  stem: string,
): { bmp: ImageBitmap; div: number } | null {
  if (images === undefined) return null;
  const hd = images.get(`${stem}@2x.png`);
  if (hd !== undefined) return { bmp: hd, div: 2 };
  const sd = images.get(`${stem}.png`);
  if (sd !== undefined) return { bmp: sd, div: 1 };
  return null;
}

// Pre-tinted variant per (bitmap, color); overlaid at variable alpha for white→tint crossfade.
const _tintCache = new WeakMap<ImageBitmap, Map<string, OffscreenCanvas>>();

function tintBitmap(bitmap: ImageBitmap, color: string): OffscreenCanvas {
  let m = _tintCache.get(bitmap);
  if (m === undefined) { m = new Map(); _tintCache.set(bitmap, m); }
  const cached = m.get(color);
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

  m.set(color, osc);
  return osc;
}

// Danser virtual-768 layout; all magic numbers below are in virtual units.
const CANVAS_W = 1280;
const CANVAS_H = 720;
const VIRTUAL_H = 768;
const S = CANVAS_H / VIRTUAL_H;

const PANEL_TOP_V = VIRTUAL_H / 2 - 64;
const PANEL_TOP   = PANEL_TOP_V * S;

const KEY_FIRST_OFF_V = 30.4;
const KEY_SPACING_V   = 47.2;
const KEY_INSET_V     = 24;

// Danser applies (1.05, 1) pre-rotation, making the vertical bar 5% longer.
const BG_LENGTH_SCALE = 1.05;

const COUNT_TEXT_HEIGHT_V = 16;
const COUNT_OVERLAP_V     = 1.6;

function drawBackgroundFallback(ctx: CanvasRenderingContext2D): void {
  const w = 90 * S;
  const h = 193 * BG_LENGTH_SCALE * S;
  const x = CANVAS_W - w;
  const y = PANEL_TOP;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fillRect(x, y, w, h);
}

function drawKeyFallback(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  size: number,
  tint: number,
  pressedColor: string,
): void {
  const r = size / 2;
  ctx.save();
  ctx.beginPath();
  const cr = size * 0.18;
  ctx.moveTo(cx - r + cr, cy - r);
  ctx.lineTo(cx + r - cr, cy - r);
  ctx.quadraticCurveTo(cx + r, cy - r, cx + r, cy - r + cr);
  ctx.lineTo(cx + r, cy + r - cr);
  ctx.quadraticCurveTo(cx + r, cy + r, cx + r - cr, cy + r);
  ctx.lineTo(cx - r + cr, cy + r);
  ctx.quadraticCurveTo(cx - r, cy + r, cx - r, cy + r - cr);
  ctx.lineTo(cx - r, cy - r + cr);
  ctx.quadraticCurveTo(cx - r, cy - r, cx - r + cr, cy - r);
  ctx.closePath();
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  if (tint > 0) {
    ctx.fillStyle = pressedColor;
    ctx.globalAlpha = tint;
    ctx.fill();
  }
  ctx.restore();
}

function drawCount(
  ctx: CanvasRenderingContext2D,
  images: Map<string, ImageBitmap> | undefined,
  scorePrefix: string,
  count: number,
  cx: number, cy: number,
  heightCanvas: number,
  overlapCanvas: number,
): void {
  const text = String(count);

  // Prefer scoreentry-N (no skin.ini prefix directive); fall back to scorePrefix glyphs.
  const digits = Array.from(text);
  const bmps: (ImageBitmap | null)[] = [];
  let allBitmap = true;
  for (const d of digits) {
    const asset = skinAsset(images, `scoreentry-${d}`) ?? skinAsset(images, `${scorePrefix}-${d}`);
    if (asset === null) { allBitmap = false; break; }
    bmps.push(asset.bmp);
  }

  if (allBitmap) {
    const widths = bmps.map(b => (b!.width / b!.height) * heightCanvas);
    const totalW = widths.reduce((s, w) => s + w, 0) - overlapCanvas * (digits.length - 1);
    let x = cx - totalW / 2;
    const y = cy - heightCanvas / 2;
    for (let i = 0; i < digits.length; i++) {
      ctx.drawImage(bmps[i]!, x, y, widths[i]!, heightCanvas);
      x += widths[i]! - overlapCanvas;
    }
    return;
  }

  ctx.save();
  ctx.font = `bold ${Math.round(heightCanvas * 0.85)}px ${SYSTEM_UI_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#000000';
  ctx.fillText(text, cx, cy);
  ctx.restore();
}

interface KeyRenderState {
  scale: number;
  tint: number;
  count: number;
  pressedColor: string;
}

// Shared panel chrome + per-key sprite/animation/count draw, used by both the std (4-key
// bitmask) overlay and the catch (3-key Left/Right/Dash) overlay. Keys are laid out top-down
// at KEY_FIRST_OFF_V + k·KEY_SPACING_V, so a 3-key panel simply leaves the bottom slot empty
// (matching lazer's top-anchored key flow). Positions follow danser-go scoreoverlay.go;
// primitive fallback when assets are missing.
function drawKeyPanel(
  ctx: CanvasRenderingContext2D,
  states: readonly KeyRenderState[],
  skin?: SkinAssets,
): void {
  const images = skin?.images;

  // Anchor top-left at (CANVAS_W, PANEL_TOP); rotate 90° CW with (1.05, 1) pre-scale.
  const bgAsset = skinAsset(images, 'inputoverlay-background');
  if (bgAsset !== null) {
    const nw = bgAsset.bmp.width  / bgAsset.div;
    const nh = bgAsset.bmp.height / bgAsset.div;
    const w = nw * S;
    const h = nh * S;
    ctx.save();
    ctx.translate(CANVAS_W, PANEL_TOP);
    ctx.rotate(Math.PI / 2);
    ctx.scale(BG_LENGTH_SCALE, 1);
    ctx.drawImage(bgAsset.bmp, 0, 0, w, h);
    ctx.restore();
  } else {
    drawBackgroundFallback(ctx);
  }

  const keyAsset = skinAsset(images, 'inputoverlay-key');
  const keyNativeW = keyAsset !== null ? keyAsset.bmp.width  / keyAsset.div : 46;
  const keyNativeH = keyAsset !== null ? keyAsset.bmp.height / keyAsset.div : 46;
  const keyCanvasW = keyNativeW * S;
  const keyCanvasH = keyNativeH * S;

  const cx = CANVAS_W - KEY_INSET_V * S;
  const scorePrefix = skin?.config.scorePrefix ?? 'score';

  for (let k = 0; k < states.length; k++) {
    const st = states[k]!;
    const cy = PANEL_TOP + (KEY_FIRST_OFF_V + k * KEY_SPACING_V) * S;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(st.scale, st.scale);

    if (keyAsset !== null) {
      const x = -keyCanvasW / 2;
      const y = -keyCanvasH / 2;
      ctx.drawImage(keyAsset.bmp, x, y, keyCanvasW, keyCanvasH);
      if (st.tint > 0) {
        ctx.save();
        ctx.globalAlpha = st.tint;
        ctx.drawImage(tintBitmap(keyAsset.bmp, st.pressedColor), x, y, keyCanvasW, keyCanvasH);
        ctx.restore();
      }
    } else {
      drawKeyFallback(ctx, 0, 0, keyCanvasW, st.tint, st.pressedColor);
    }

    // Active ctx.scale squishes text in sync with the key sprite (matches danser).
    drawCount(ctx, images, scorePrefix, st.count, 0, 0, COUNT_TEXT_HEIGHT_V * S, COUNT_OVERLAP_V * S);

    ctx.restore();
  }
}

/**
 * Draw the std key overlay (right edge): K1/K2/M1/M2 press state, press animation, and
 * cumulative press counts, read from the per-frame replay button bitmask. Per-replay
 * timelines are built lazily on first call and cached. `ctx` is in logical 1280×720 coords.
 */
export function drawKeyOverlay(
  ctx: CanvasRenderingContext2D,
  replay: ReplayData,
  timeMs: number,
  skin?: SkinAssets,
): void {
  const { frames } = replay;
  if (frames.length === 0) return;

  const times = getCumulativeTimes(frames);
  const idx = findFrameIndex(times, timeMs);
  const timelines = getTimelines(frames);
  const counts = getPressCounts(frames);

  const states: KeyRenderState[] = [];
  for (let k = 0; k < KEY_DEFS.length; k++) {
    const { scale, tint } = computeKeyState(timelines[k]!, timeMs);
    const count = idx >= 0 ? (counts[k]![idx] ?? 0) : 0;
    states.push({ scale, tint, count, pressedColor: KEY_DEFS[k]!.pressedColor });
  }

  drawKeyPanel(ctx, states, skin);
}

// ---- Catch (CTB) key overlay ----
//
// Catch has no K1/K2/M1/M2: its actions are MoveLeft, MoveRight, Dash (CatchAction). The legacy
// replay encodes only the catcher X per frame plus a single Dash bit (Left1); lazer's
// CatchReplayFrame.FromLegacy reconstructs MoveLeft/MoveRight from the sign of the X delta to the
// NEXT frame (attached to the previous frame). We mirror that off the decoded catcher path — all
// decorative (catch judgement is positional, never key-based). Active colours match lazer's
// LegacyKeyCounterDisplay (first two keys yellow, the rest pink): Left/Right yellow, Dash pink.

// Minimal catcher-path shape (structurally matches rulesets/catch/input CatcherFrame); kept
// local so this shared renderer doesn't import from a ruleset.
type CatchPathFrame = { readonly time: number; readonly x: number; readonly dash: boolean };

const CATCH_KEY_COLORS = ['#ffde00', '#ffde00', '#f8009e'] as const;

type CatchKeyTimelines = [KeyEvent[], KeyEvent[], KeyEvent[]];
const _catchTimelines = new WeakMap<readonly CatchPathFrame[], CatchKeyTimelines>();
const _catchCounts    = new WeakMap<readonly CatchPathFrame[], [number[], number[], number[]]>();
const _catchTimes     = new WeakMap<readonly CatchPathFrame[], number[]>();

function buildCatchData(path: readonly CatchPathFrame[]): {
  timelines: CatchKeyTimelines;
  counts: [number[], number[], number[]];
  times: number[];
} {
  const times = new Array<number>(path.length);
  for (let i = 0; i < path.length; i++) times[i] = path[i]!.time;

  // key 0 = MoveLeft, 1 = MoveRight, 2 = Dash. Direction is the sign of x[i+1]−x[i] (lazer
  // attaches the move action to frame i); the final frame has no successor ⇒ no direction.
  const { timelines, counts } = buildKeyTimelines(times, 3, (i, k) => {
    if (k === 2) return path[i]!.dash;
    if (i >= path.length - 1) return false;
    const dx = path[i + 1]!.x - path[i]!.x;
    return k === 0 ? dx < 0 : dx > 0;
  });

  return {
    timelines: timelines as CatchKeyTimelines,
    counts: counts as [number[], number[], number[]],
    times,
  };
}

function getCatchData(path: readonly CatchPathFrame[]): {
  timelines: CatchKeyTimelines;
  counts: [number[], number[], number[]];
  times: number[];
} {
  const cached = _catchTimelines.get(path);
  if (cached === undefined) {
    const built = buildCatchData(path);
    _catchTimelines.set(path, built.timelines);
    _catchCounts.set(path, built.counts);
    _catchTimes.set(path, built.times);
    return built;
  }
  return { timelines: cached, counts: _catchCounts.get(path)!, times: _catchTimes.get(path)! };
}

/**
 * Draw the catch key overlay (right edge): Left / Right / Dash, driven by the decoded
 * catcher path rather than the replay button bitmask (see the section note above).
 * `path` frames are (time ms, catcher x, dash flag); `ctx` is in logical 1280×720 coords.
 */
export function drawCatchKeyOverlay(
  ctx: CanvasRenderingContext2D,
  path: readonly CatchPathFrame[],
  timeMs: number,
  skin?: SkinAssets,
): void {
  if (path.length === 0) return;

  const { timelines, counts, times } = getCatchData(path);
  const idx = findFrameIndex(times, timeMs);

  const states: KeyRenderState[] = [];
  for (let k = 0; k < 3; k++) {
    const { scale, tint } = computeKeyState(timelines[k]!, timeMs);
    const count = idx >= 0 ? (counts[k]![idx] ?? 0) : 0;
    states.push({ scale, tint, count, pressedColor: CATCH_KEY_COLORS[k]! });
  }

  drawKeyPanel(ctx, states, skin);
}
