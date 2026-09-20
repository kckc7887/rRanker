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
import { visibleJudgements } from "../../engine-performance";
import type { HitResult, SkinAssets } from '../types/index';

const SYSTEM_UI_FONT = 'system-ui, "Segoe UI", "PingFang SC", "Microsoft YaHei UI", sans-serif';

const CANVAS_W = 1280;
const CANVAS_H = 720;
// Must match HitObjectRenderer.
const SCALE    = Math.min(800 / 512, 600 / 384) * 0.9;
const OFFSET_X = (CANVAS_W - 512 * SCALE) / 2;
const OFFSET_Y = (CANVAS_H - 384 * SCALE) / 2;

function toCanvas(x: number, y: number): [number, number] {
  return [OFFSET_X + x * SCALE, OFFSET_Y + y * SCALE];
}

// Danser hitresults.go.
const RESULT_FADE_IN  = 120;
const POST_EMPT       = 500;
const RESULT_FADE_OUT = 600;
const TOTAL_MS        = POST_EMPT + RESULT_FADE_OUT;

// Miss drifts y+45 over lifetime and rotates by an angle that doubles.
const MISS_Y_START    = -5;
const MISS_Y_END      = 40;
const MISS_ROT_RANGE  = 0.3;
const MISS_ROT_CENTER = 0.15;

// Lazer LegacyJudgementPieceOld (legacy-skin taiko popups). Multi-frame skips scale/move/rotate.
const LEGACY_TAIKO_FADE_IN_MS         = 120;
const LEGACY_TAIKO_FADE_OUT_DELAY_MS  = 500;
const LEGACY_TAIKO_FADE_OUT_MS        = 600;
const LEGACY_TAIKO_TOTAL_MS           = LEGACY_TAIKO_FADE_OUT_DELAY_MS + LEGACY_TAIKO_FADE_OUT_MS;

// Lazer getFrameLength (applyConfigFrameRate=false) = 1000 / textures.Length.
const LEGACY_TAIKO_ANIM_TOTAL_MS = 1000;

// Y=-5 start matches stable legacyVersion > 1.0 path; we don't parse skin.ini Version.
const LEGACY_TAIKO_MISS_SCALE_MS     = 100;
const LEGACY_TAIKO_MISS_SCALE_START  = 1.6;
const LEGACY_TAIKO_MISS_SCALE_END    = 1.0;
const LEGACY_TAIKO_MISS_Y_START_PX   = -5;
const LEGACY_TAIKO_MISS_Y_END_PX     = 75;
// Spec: RNG.NextSingle(-8.6f, 8.6f) degrees.
const LEGACY_TAIKO_MISS_ROT_MAX_RAD  = (8.6 * Math.PI) / 180;

function clamp01(t: number): number { return t <= 0 ? 0 : t >= 1 ? 1 : t; }
function inQuad(t: number): number   { const x = clamp01(t); return x * x; }

function legacyTaikoFade(age: number): number {
  if (age < LEGACY_TAIKO_FADE_IN_MS) return age / LEGACY_TAIKO_FADE_IN_MS;
  if (age < LEGACY_TAIKO_FADE_OUT_DELAY_MS) return 1;
  return 1 - (age - LEGACY_TAIKO_FADE_OUT_DELAY_MS) / LEGACY_TAIKO_FADE_OUT_MS;
}

// Snap to 0.95 between the 0.9→1.0 segments matches lazer's LegacyJudgementPieceOld.
function legacyTaikoHitScale(age: number): number {
  if (age < 96)  return 0.6 + (1.1 - 0.6) * (age / 96);
  if (age < 120) return 1.1;
  if (age < 144) return 1.1 + (0.9 - 1.1) * ((age - 120) / 24);
  if (age < 168) return 0.95 + (1.0 - 0.95) * ((age - 144) / 24);
  return 1.0;
}

// First image present and not a 1×1 placeholder wins; @2x preferred.
const SKIN_STEMS: Record<number, string[]> = {
  300: ['hit300', 'hit300-0'],
  100: ['hit100', 'hit100-0'],
  50:  ['hit50',  'hit50-0'],
  0:   ['hit0',   'hit0-0'],
};

// Split from std fallback: a 1×1 taiko-prefixed placeholder is an explicit suppression and
// must NOT fall through to the bare hit300 stem (which on many skins is a non-empty std sprite).
const TAIKO_SKIN_STEMS: Record<number, string[]> = {
  300: ['taiko-hit300'],
  100: ['taiko-hit100'],
  0:   ['taiko-hit0'],
};
const TAIKO_STRONG_STEMS: Record<number, string[]> = {
  300: ['taiko-hit300k', 'taiko-hit300'],
  100: ['taiko-hit100k', 'taiko-hit100'],
  0:   ['taiko-hit0'],
};
const TAIKO_STD_FALLBACK: Record<number, string[]> = {
  300: ['hit300', 'hit300-0'],
  100: ['hit100', 'hit100-0'],
  0:   ['hit0',   'hit0-0'],
};

/** Look up a stem trying @2x then 1x. Returns the bitmap regardless of size. */
function lookupStem(images: Map<string, ImageBitmap>, stem: string): ImageBitmap | undefined {
  return images.get(`${stem}@2x.png`) ?? images.get(`${stem}.png`);
}

/** Sprite + how to interpret its pixel size (@2x sprites halve to natural). */
interface SpriteWithScale { bitmap: ImageBitmap; pixelScale: number }

/** @2x-aware lookup that returns the natural-size scale alongside the bitmap.
 *  Filters 1×1 placeholder PNGs (the skin-author "explicitly suppressed" convention). */
function lookupStemNatural(images: Map<string, ImageBitmap>, stem: string): SpriteWithScale | undefined {
  const at2x = images.get(`${stem}@2x.png`);
  if (at2x !== undefined && at2x.width > 1) return { bitmap: at2x, pixelScale: 0.5 };
  const at1x = images.get(`${stem}.png`);
  if (at1x !== undefined && at1x.width > 1) return { bitmap: at1x, pixelScale: 1.0 };
  return undefined;
}

/** Returns true if the skin ships a 1×1 placeholder for this stem (suppression).
 *  Used to halt the fallback chain when a skinner explicitly blanked the stem. */
function isStemSuppressed(images: Map<string, ImageBitmap>, stem: string): boolean {
  const at2x = images.get(`${stem}@2x.png`);
  if (at2x !== undefined && at2x.width === 1) return true;
  const at1x = images.get(`${stem}.png`);
  if (at1x !== undefined && at1x.width === 1) return true;
  return false;
}

function resolveStemFrames(images: Map<string, ImageBitmap>, stem: string): SpriteWithScale[] {
  const frames: SpriteWithScale[] = [];
  for (let i = 0; ; i++) {
    const f = lookupStemNatural(images, `${stem}-${i}`);
    if (f === undefined) {
      if (isStemSuppressed(images, `${stem}-${i}`)) return [];
      break;
    }
    frames.push(f);
  }
  if (frames.length > 0) return frames;
  const single = lookupStemNatural(images, stem);
  return single !== undefined ? [single] : [];
}

/** std: first present, non-1×1 stem wins (@2x preferred), reported with its native scale
 *  so the burst can be drawn at canonical legacy scale instead of a fixed box. */
function resolveStdJudgementSprite(
  images: Map<string, ImageBitmap>,
  judgement: number,
): SpriteWithScale | undefined {
  const stems = SKIN_STEMS[judgement];
  if (!stems) return undefined;
  for (const stem of stems) {
    const sp = lookupStemNatural(images, stem);
    if (sp !== undefined) return sp;
  }
  return undefined;
}

// Taiko mode: any taiko-prefixed stem (even 1×1) is authoritative — never fall through to std.
function resolveJudgementImage(
  images: Map<string, ImageBitmap>,
  judgement: number,
  taiko: boolean,
  strong: boolean,
): ImageBitmap | undefined {
  if (taiko) {
    const taikoStems = (strong ? TAIKO_STRONG_STEMS : TAIKO_SKIN_STEMS)[judgement] ?? [];
    let suppressed = false;
    for (const stem of taikoStems) {
      const bm = lookupStem(images, stem);
      if (bm === undefined) continue;
      if (bm.width > 1) return bm;
      suppressed = true;
    }
    if (suppressed) return undefined;
    for (const stem of TAIKO_STD_FALLBACK[judgement] ?? []) {
      const bm = lookupStem(images, stem);
      if (bm !== undefined && bm.width > 1) return bm;
    }
    return undefined;
  }
  const stems = SKIN_STEMS[judgement];
  if (!stems) return undefined;
  for (const stem of stems) {
    const bm = lookupStem(images, stem);
    if (bm !== undefined && bm.width > 1) return bm;
  }
  return undefined;
}

// Returns null on explicit 1×1 suppression (skip std fallback); [] when nothing shipped.
function resolveTaikoPopupFrames(
  images: Map<string, ImageBitmap>,
  judgement: number,
  strong: boolean,
): SpriteWithScale[] | null {
  const taikoStems = (strong ? TAIKO_STRONG_STEMS : TAIKO_SKIN_STEMS)[judgement] ?? [];
  let suppressed = false;
  for (const stem of taikoStems) {
    const frames = resolveStemFrames(images, stem);
    if (frames.length > 0) return frames;
    if (isStemSuppressed(images, stem)) suppressed = true;
  }
  return suppressed ? null : [];
}

const LABEL: Record<number, string> = {
  300: '300',
  100: '100',
  50:  '50',
  0:   '✗',
};

const COLOR: Record<number, string> = {
  300: '#ffff44',
  100: '#44ccff',
  50:  '#88ff88',
  0:   '#ff5555',
};

const FONT_SIZE: Record<number, number> = {
  300: 22,
  100: 20,
  50:  18,
  0:   26,
};

// Taiko bursts (including std-sprite fallbacks) draw into this fixed box, in canvas px.
const IMAGE_SIZE = 128;

// osu! OBJECT_DIMENSIONS (= 2 × OBJECT_RADIUS). std bursts use the canonical legacy scale —
// one @1x texture pixel = one osu! gamefield unit, a 128px@1x sprite spans the circle
// diameter (2 × radius) — matching danser hitresults.go (nativeTex × CircleRadius/64) and the
// hit-circle/head/ball scaling in HitObjectRenderer's canonicalDiameter.
const OBJECT_DIAMETER_PX = 128;

// Danser bounce-in: 0.6→1.1 (96ms), hold (24ms), 1.1→0.9 (24ms), 0.9→1.0 (24ms).
function bounceScale(age: number): number {
  const a = RESULT_FADE_IN * 0.8;   // 96
  const b = RESULT_FADE_IN;         // 120
  const c = RESULT_FADE_IN * 1.2;   // 144
  const d = RESULT_FADE_IN * 1.4;   // 168
  if (age < a) return 0.6 + (1.1 - 0.6) * (age / a);
  if (age < b) return 1.1;
  if (age < c) return 1.1 + (0.9 - 1.1) * ((age - b) / (c - b));
  if (age < d) return 0.9 + (1.0 - 0.9) * ((age - c) / (d - c));
  return 1.0;
}

/**
 * Deterministic per-result rotation seed in [-0.15, +0.15].  Uses result.time
 * so the rotation is stable across frames without storing any per-result state.
 */
function missRotationSeed(time: number): number {
  const x = Math.sin(time * 0.1234567) * 43758.5453;
  const frac = x - Math.floor(x);
  return frac * MISS_ROT_RANGE - MISS_ROT_CENTER;
}

/**
 * Draw judgement popups (300/100/50/miss bursts) for every result whose animation window
 * contains `timeMs` (beatmap ms). In taiko mode `result.x/y` are already canvas coords
 * (popups pre-placed by the judgement pipeline); in std mode they are osu!pixels and are
 * converted here. `circleRadiusOsuPx` (std only) is the mod-adjusted osu!-pixel circle
 * radius used to size bursts at canonical legacy scale; omitted for taiko (fixed box).
 */
export function drawJudgements(
  ctx: CanvasRenderingContext2D,
  results: readonly HitResult[],
  timeMs: number,
  skin?: SkinAssets,
  mode: 'std' | 'taiko' = 'std',
  circleRadiusOsuPx?: number,
): void {
  const isTaiko = mode === 'taiko';
  for (const result of visibleJudgements(results, timeMs, isTaiko, isTaiko ? LEGACY_TAIKO_TOTAL_MS : TOTAL_MS)) {
    if (isTaiko) {
      if (result.comboIgnore === true) continue;
    } else {
      if (result.isSliderSub === true) continue;
      // 300s hidden by default to reduce visual noise on clean plays.
      if (result.judgement === 300) continue;
    }

    const displayJudgement: number = result.judgement;

    const popupTime = result.displayTime ?? result.time;
    const age = timeMs - popupTime;
    const lifetime = isTaiko ? LEGACY_TAIKO_TOTAL_MS : TOTAL_MS;
    if (age < 0 || age > lifetime) continue;

    const isMissDisplay = displayJudgement === 0;

    const [cx, cy] = isTaiko ? [result.x, result.y] : toCanvas(result.x, result.y);

    let alpha: number;
    let scale: number;
    let x = cx;
    let y = cy;
    let rotation = 0;

    // Multi-frame popups skip the scale bounce — the frame animation carries the punch.
    let taikoFrames: SpriteWithScale[] | null | undefined;
    if (isTaiko && skin) {
      taikoFrames = resolveTaikoPopupFrames(skin.images, displayJudgement, result.strong === true);
    }
    const isTaikoAnim = isTaiko && taikoFrames !== undefined && taikoFrames !== null && taikoFrames.length > 1;

    if (isTaiko) {
      // Legacy taiko popup animation (lazer LegacyJudgementPieceOld); multi-frame
      // popups skip scale/move/rotate.
      alpha = legacyTaikoFade(age);
      if (isTaikoAnim) {
        scale = 1.0;
      } else if (isMissDisplay) {
        scale = age >= LEGACY_TAIKO_MISS_SCALE_MS
          ? LEGACY_TAIKO_MISS_SCALE_END
          : LEGACY_TAIKO_MISS_SCALE_START
            + (LEGACY_TAIKO_MISS_SCALE_END - LEGACY_TAIKO_MISS_SCALE_START)
              * inQuad(age / LEGACY_TAIKO_MISS_SCALE_MS);
        const yu = clamp01(age / LEGACY_TAIKO_TOTAL_MS);
        y += LEGACY_TAIKO_MISS_Y_START_PX
           + (LEGACY_TAIKO_MISS_Y_END_PX - LEGACY_TAIKO_MISS_Y_START_PX) * (yu * yu);
        // r seeded from result.time so the tumble is stable across replay seeks.
        const r = missRotationSeed(result.time) * (LEGACY_TAIKO_MISS_ROT_MAX_RAD / MISS_ROT_CENTER);
        if (age < LEGACY_TAIKO_FADE_IN_MS) {
          rotation = r * (age / LEGACY_TAIKO_FADE_IN_MS);
        } else {
          const ru = clamp01(
            (age - LEGACY_TAIKO_FADE_IN_MS)
            / (LEGACY_TAIKO_TOTAL_MS - LEGACY_TAIKO_FADE_IN_MS),
          );
          rotation = r + r * (ru * ru);
        }
      } else {
        scale = legacyTaikoHitScale(age);
      }
    } else {
      if (age < RESULT_FADE_IN) alpha = age / RESULT_FADE_IN;
      else if (age < POST_EMPT) alpha = 1;
      else                      alpha = 1 - (age - POST_EMPT) / RESULT_FADE_OUT;
      scale = bounceScale(age);
      if (isMissDisplay) {
        y = cy + MISS_Y_START + (MISS_Y_END - MISS_Y_START) * (age / TOTAL_MS);
        const r = missRotationSeed(result.time);
        if (age < RESULT_FADE_IN) {
          rotation = r * (age / RESULT_FADE_IN);
        } else {
          rotation = r + r * ((age - RESULT_FADE_IN) / (TOTAL_MS - RESULT_FADE_IN));
        }
      }
    }

    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.translate(x, y);
    if (rotation !== 0) ctx.rotate(rotation);
    ctx.scale(scale, scale);

    const strong = isTaiko && result.strong === true;

    if (isTaiko && taikoFrames !== undefined && taikoFrames !== null && taikoFrames.length > 0) {
      // Natural sprite size; multi-frame holds last frame after lifetime ends.
      let frameIdx = 0;
      if (taikoFrames.length > 1) {
        const frameLen = LEGACY_TAIKO_ANIM_TOTAL_MS / taikoFrames.length;
        frameIdx = Math.min(taikoFrames.length - 1, Math.max(0, Math.floor(age / frameLen)));
      }
      const sp = taikoFrames[frameIdx]!;
      const drawW = sp.bitmap.width  * sp.pixelScale;
      const drawH = sp.bitmap.height * sp.pixelScale;
      ctx.drawImage(sp.bitmap, -drawW / 2, -drawH / 2, drawW, drawH);
    } else if (isTaiko && taikoFrames === null) {
      // 1×1 placeholder suppression — render nothing.
    } else {
      // Resolve the burst sprite + its draw size. std sizes at canonical legacy scale
      // (native @1x texture × 2·radius/128 — same scale as hit circles, per danser
      // hitresults.go); taiko keeps its fixed IMAGE_SIZE box.
      let burst: { bitmap: ImageBitmap; drawW: number; drawH: number } | undefined;
      if (!isTaiko) {
        const sp = skin ? resolveStdJudgementSprite(skin.images, displayJudgement) : undefined;
        if (sp !== undefined && circleRadiusOsuPx !== undefined) {
          const k = (2 * circleRadiusOsuPx * SCALE) / OBJECT_DIAMETER_PX;
          burst = {
            bitmap: sp.bitmap,
            drawW:  sp.bitmap.width  * sp.pixelScale * k,
            drawH:  sp.bitmap.height * sp.pixelScale * k,
          };
        }
      } else {
        const bitmap = skin
          ? resolveJudgementImage(skin.images, displayJudgement, true, strong)
          : undefined;
        if (bitmap !== undefined) {
          // Preserve native aspect inside IMAGE_SIZE² box; pill-shaped sprites need this.
          const aspect = bitmap.width / bitmap.height;
          burst = {
            bitmap,
            drawW: aspect >= 1 ? IMAGE_SIZE : IMAGE_SIZE * aspect,
            drawH: aspect >= 1 ? IMAGE_SIZE / aspect : IMAGE_SIZE,
          };
        }
      }
      if (burst !== undefined) {
        ctx.drawImage(burst.bitmap, -burst.drawW / 2, -burst.drawH / 2, burst.drawW, burst.drawH);
      } else {
        const label    = LABEL[displayJudgement]    ?? '?';
        const color    = COLOR[displayJudgement]    ?? '#ffffff';
        const fontSize = FONT_SIZE[displayJudgement] ?? 20;

        ctx.font = `bold ${fontSize}px ${SYSTEM_UI_FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.lineWidth = 3;
        ctx.strokeText(label, 0, 0);
        ctx.fillStyle = color;
        ctx.fillText(label, 0, 0);
      }
    }

    ctx.restore();
  }
}
