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
import type { ScoreFrame } from '../utils/scoreProcessor';

const SYSTEM_UI_FONT = 'system-ui, "Segoe UI", "PingFang SC", "Microsoft YaHei UI", sans-serif';

const CANVAS_W  = 1280;



const SCORE_RIGHT_X = CANVAS_W - 4;
const SCORE_Y       = 4;
const SCORE_DIGIT_H = 30;
const SCORE_DIGITS  = 8;

const ACC_DIGIT_H = 22;
const ACC_RIGHT_X = CANVAS_W - 4;
const ACC_Y       = SCORE_Y + SCORE_DIGIT_H + 2;

const COMBO_LEFT_X  = 14;
const CANVAS_H      = 720;
const COMBO_DIGIT_H = 32;
const COMBO_Y       = CANVAS_H - COMBO_DIGIT_H - 4;
const COMBO_ANIM_MS = 250;

/** One point of the running-accuracy timeline: accuracy as of `time` (beatmap ms). */
export interface AccFrame {
  time: number;
  acc:  number;   // 0..1
}

/**
 * Running accuracy after each judged object, in time order.
 * osu! acc = sum(judgements) / (300 × objectCount); slider sub-results and
 * combo-ignored ticks are excluded.
 */
export function computeAccTimeline(results: readonly HitResult[]): AccFrame[] {
  const sorted = [...results].sort((a, b) => a.time - b.time);

  const frames: AccFrame[] = [];
  let judgeSum = 0;
  let objCount = 0;

  for (const r of sorted) {
    // Std slider ticks/edges/tail are off-accuracy; taiko comboIgnore ticks too.
    if (r.isSliderSub) continue;
    if (r.comboIgnore) continue;
    judgeSum += r.judgement;
    objCount++;
    frames.push({ time: r.time, acc: judgeSum / (300 * objCount) });
  }

  return frames;
}

/** Taiko running accuracy: (great + 0.5×ok) / (great + ok + miss).
 * Scaling Ok to 150 in the 300-based sum reduces to exactly this. */
export function computeTaikoAccTimeline(results: readonly HitResult[]): AccFrame[] {
  const sorted = [...results].sort((a, b) => a.time - b.time);

  const frames: AccFrame[] = [];
  let weightedSum = 0;
  let objCount = 0;

  for (const r of sorted) {
    if (r.comboIgnore) continue;
    if      (r.judgement === 300) weightedSum += 300;
    else if (r.judgement === 100) weightedSum += 150;
    objCount++;
    frames.push({ time: r.time, acc: weightedSum / (300 * objCount) });
  }

  return frames;
}

/** One point of the displayed-combo timeline: combo value as of `time` (beatmap ms). */
export interface ComboFrame {
  time:  number;
  combo: number;
}

/**
 * Displayed combo after each judged result, in time order. `comboBreak` resets the combo
 * and blocks the increment; a tail miss (judgement=0, comboBreak=false) leaves combo alone.
 */
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

/**
 * Resolve a score/combo glyph bitmap. `prefix` is the skin.ini path-prefix
 * (e.g. `score`, or `fonts/score/score` for subfolder skins); the image map
 * is already full-path-keyed by SkinLoader.
 *
 * When both `@2x` and 1× variants exist, the choice is size-aware: `targetPx`
 * is the glyph's on-screen height in device pixels (logical digitH × canvas
 * scale). The @2x source is twice the 1× source, so blindly using it forces a
 * large single-step downscale on small text — the accuracy readout (the
 * smallest HUD number) ends up visibly fuzzier than everything else. We only
 * reach for @2x once the target is taller than the 1× glyph; below that the 1×
 * source needs far less downscaling (and never upscales), staying crisp.
 * `targetPx` undefined keeps the variant-agnostic @2x preference for callers
 * that only need the aspect ratio (identical across variants).
 */
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

// Per-frame digit widths would otherwise walk the skin image map every call.
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

// Width follows the skin image's aspect ratio; falls back to 0.65× for the monospace text path.
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

  // Glyph height in device pixels = logical digitH × the canvas's current scale
  // (Renderer applies ctx.scale(total); combo pop adds a transient factor on top).
  // Drives the size-aware @2x/1× variant pick in glyphImage.
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

const MOD_STEMS: [number, string, string][] = [
  [1 << 0,  'selection-mod-nofail',      'NF'],
  [1 << 1,  'selection-mod-easy',         'EZ'],
  [1 << 3,  'selection-mod-hidden',       'HD'],
  [1 << 4,  'selection-mod-hardrock',     'HR'],
  [1 << 5,  'selection-mod-suddendeath',  'SD'],
  [1 << 6,  'selection-mod-doubletime',   'DT'],
  [1 << 7,  'selection-mod-relax',        'RX'],
  [1 << 8,  'selection-mod-halftime',     'HT'],
  [1 << 9,  'selection-mod-nightcore',    'NC'],
  [1 << 10, 'selection-mod-flashlight',   'FL'],
  [1 << 12, 'selection-mod-spunout',      'SO'],
  [1 << 20, 'selection-mod-fadein',       'FI'],  // mania
  [1 << 30, 'selection-mod-mirror',       'MR'],  // mania
];

const MOD_ICON_H   = 30;
const MOD_ICON_GAP = 2;
const MOD_Y        = ACC_Y + ACC_DIGIT_H + 6;

/**
 * Draw the active-mod icon row under the accuracy readout (top-right). `mods` is the
 * legacy replay mod bitmask; DT is hidden when NC is set (NC implies DT). Uses the skin's
 * selection-mod-* sprites with a labelled-pill fallback.
 */
export function drawModIcons(
  ctx: CanvasRenderingContext2D,
  mods: number,
  skin?: SkinAssets,
): void {
  if (mods === 0) return;

  const hasNC = (mods & (1 << 9)) !== 0;
  const active: { stem: string; label: string }[] = [];
  for (const [bit, stem, label] of MOD_STEMS) {
    if ((mods & bit) === 0) continue;
    if (bit === (1 << 6) && hasNC) continue;
    active.push({ stem, label });
  }
  if (active.length === 0) return;

  const modImg = (stem: string) =>
    skin?.images.get(`${stem}@2x.png`) ?? skin?.images.get(`${stem}.png`);

  const widths = active.map(({ stem }) => {
    const bmp = modImg(stem);
    return bmp ? (bmp.width / bmp.height) * MOD_ICON_H : MOD_ICON_H * 1.6;
  });
  const totalW = widths.reduce((s, w) => s + w, 0) + MOD_ICON_GAP * (active.length - 1);

  let x = ACC_RIGHT_X - totalW;
  for (let i = 0; i < active.length; i++) {
    const { stem, label } = active[i]!;
    const w = widths[i]!;
    const bmp = modImg(stem);

    if (bmp) {
      ctx.drawImage(bmp, x, MOD_Y, w, MOD_ICON_H);
    } else {
      ctx.save();
      ctx.beginPath();
      const r = 4;
      ctx.moveTo(x + r, MOD_Y);
      ctx.arcTo(x + w, MOD_Y, x + w, MOD_Y + MOD_ICON_H, r);
      ctx.arcTo(x + w, MOD_Y + MOD_ICON_H, x, MOD_Y + MOD_ICON_H, r);
      ctx.arcTo(x, MOD_Y + MOD_ICON_H, x, MOD_Y, r);
      ctx.arcTo(x, MOD_Y, x + w, MOD_Y, r);
      ctx.closePath();
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fill();
      ctx.font = `bold ${Math.round(MOD_ICON_H * 0.55)}px ${SYSTEM_UI_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(label, x + w / 2, MOD_Y + MOD_ICON_H / 2);
      ctx.restore();
    }

    x += w + MOD_ICON_GAP;
  }
}

/** Draw the 8-digit zero-padded score (top-right) for the latest frame at or before `timeMs`. */
export function drawScore(
  ctx: CanvasRenderingContext2D,
  scoreFrames: readonly ScoreFrame[],
  timeMs: number,
  skin?: SkinAssets,
): void {
  const i     = findBefore(scoreFrames, timeMs);
  const score = i >= 0 ? scoreFrames[i]!.score : 0;

  const text = String(Math.max(0, Math.trunc(score))).padStart(SCORE_DIGITS, '0');
  drawScoreText(ctx, text, SCORE_RIGHT_X, SCORE_Y, SCORE_DIGIT_H, skin?.config.scorePrefix ?? 'score', skin);
}

/** Draw the accuracy percentage readout (top-right, below the score); 100.00% before any hit. */
export function drawHUD(
  ctx: CanvasRenderingContext2D,
  accFrames: readonly AccFrame[],
  timeMs: number,
  skin?: SkinAssets
): void {
  const i   = findBefore(accFrames, timeMs);
  const acc = i >= 0 ? accFrames[i]!.acc : 1;

  const text = (acc * 100).toFixed(2) + '%';
  drawScoreText(ctx, text, ACC_RIGHT_X, ACC_Y, ACC_DIGIT_H, skin?.config.scorePrefix ?? 'score', skin);
}

const MANIA_COMBO_DIGIT_H = 28;

// Shared pop-animated combo renderer. `anchor(totalW)` returns, from the measured text
// width: `rightX`/`topY` for drawScoreText and `cx`/`cy` for the pop-scale pivot.
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

/** Draw the std/taiko combo counter ("Nx") bottom-left, with a pop animation on change.
 * Hidden while combo is 0. */
export function drawCombo(
  ctx: CanvasRenderingContext2D,
  comboFrames: readonly ComboFrame[],
  timeMs: number,
  skin?: SkinAssets
): void {
  drawPopCombo(ctx, comboFrames, timeMs, 'x', COMBO_DIGIT_H, skin, (totalW) => ({
    rightX: COMBO_LEFT_X + 4 + totalW,
    topY:   COMBO_Y,
    cx:     COMBO_LEFT_X + 4 + totalW / 2,
    cy:     COMBO_Y + COMBO_DIGIT_H / 2,
  }));
}

/**
 * Mania combo: centered on (centerX, centerY) with no `x` suffix, scaled bitmap glyphs,
 * pop animation on each change. Caller (mania ruleset) picks position from the stage
 * layout + skin's `ComboPosition`.
 */
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
