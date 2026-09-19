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
import type { CatchSession, CatchObject, CatchObjectType } from './types';
import type { CatcherFrame } from './input';
import type { RenderOptions } from '../../renderer/Renderer';
import { calculateScaleFromCircleSize } from './converter';
import { sampleCatcherX } from './input';
import { CatchFlashlight } from './Flashlight';
import { drawManiaCombo } from '../../renderer/HUDRenderer';

/**
 * Catch playfield rendering. Reproduces the lazer baseline: the -100→340 fall band,
 * AR→Constant-scroll fall time, fruit/droplet/banana visuals (legacy skin sprites when the
 * skin ships them, procedural geometry otherwise), and the replay-driven catcher.
 *
 * The catcher is drawn from the skin's `fruit-catcher-{idle,fail,kiai}` sprites (or the
 * old-style `fruit-ryuuta`) with the full feedback layer: the 180 ms red hyperdash catcher
 * tint, the dash/hyperdash trail + once-per-transition afterimage, the catch splash /
 * legacy hit explosion, and the caught-fruit plate pile.
 *
 * Everything is reconstructed from `timeMs` alone (catcher state, hyperdash windows, trail
 * ghosts, splashes) so the look is deterministic on scrub/rewind — the same requirement
 * lazer places on per-object visual RNG.
 */

// ---- Coordinate space ----
const PLAYFIELD_W = 512;          // CatchPlayfield.WIDTH
const OBJECT_RADIUS = 64;         // CatchHitObject.OBJECT_RADIUS
const CATCHER_BASE_SIZE = 106.75; // Catcher.BASE_SIZE
const ALLOWED_CATCH_RANGE = 0.8;  // Catcher.ALLOWED_CATCH_RANGE

const CANVAS_W = 1280;            // Renderer LOGICAL_W
             // Renderer LOGICAL_H

// Fall band in osu-Y: fruit fall from stable's -100 (frac=1, spawn-top) to the catcher line at
// stable's 340 (frac=0) — a 440-unit band, the CatchPlayfieldAdjustmentContainer vertical
// remap, NOT a naive 0..384.
const FALL_TOP_OSU = -100;
const CATCH_LINE_OSU = 340;
const FALL_BAND_OSU = CATCH_LINE_OSU - FALL_TOP_OSU; // 440

// Isotropic osu-px → screen-px scale (lazer's Scale.X == Scale.Y), so the fall band stays
// 440/512 of the playfield width — the in-game vertical:horizontal proportion. At S = 1.4 the
// playfield is 512·1.4 = 716.8 px wide (≈ the std playfield width, so catch sits consistently
// on the 1280×720 canvas) and the fall band is 440·1.4 = 616 px tall.
//
// The legacy catcher is a CHARACTER hanging below the plate (the rim/catch surface is at the TOP of
// the sprite, the body extends below), so the catch line sits a little above the canvas bottom to
// show the torso — the legs still reach the screen edge, as in game. At y = 628 the band spans
// y∈[12, 628]; fall SPEED/spacing depend only on S and fallMs, not on this vertical placement.
const S = 1.4;
const SCREEN_PLAYFIELD_W = PLAYFIELD_W * S;
const OFFSET_X = (CANVAS_W - SCREEN_PLAYFIELD_W) / 2;
const CATCH_LINE_Y = 628;

// CatchComboDisplay (CatcherArea.cs): the combo counter is a child of the catcher area (anchored to
// its top, which is the catch line) with Origin.Centre and `Margin.Bottom = 350`, and its X is
// reassigned to `Catcher.X` every frame — so the combo TRACKS the catcher horizontally, it is NOT
// pinned to the playfield centre.
//   • The 350 is in CatchPlayfield LOGICAL units (HEIGHT = 384), not stable-band units.
//   • Origin.Centre + a bottom margin expands the layout box downward, so the osu!framework origin
//     (centre of the expanded box) puts the counter's CENTRE Margin.Bottom/2 = 175 logical units
//     ABOVE the catch line (verified via Drawable.OriginPosition = LayoutSize/2 − margin.Top).
//   • One logical unit spans (FALL_BAND_OSU / HEIGHT)·S screen px after the vertical remap (the
//     384-tall field stretched onto the −100..340 band, then the isotropic S).
const CATCH_PLAYFIELD_LOGICAL_H = 384; // CatchPlayfield.HEIGHT
const COMBO_MARGIN_BOTTOM_OSU = 350;   // CatchComboDisplay.Margin.Bottom (logical)
const COMBO_CENTRE_ABOVE_LINE_OSU =
  (COMBO_MARGIN_BOTTOM_OSU / 2) * (FALL_BAND_OSU / CATCH_PLAYFIELD_LOGICAL_H);

function screenX(effectiveX: number): number {
  return OFFSET_X + effectiveX * S;
}
// frac = (startTime - now) / fallTimeMs ∈ [0,1]; 1 at spawn-top, 0 at the catch line.
function screenYFromFrac(frac: number): number {
  return CATCH_LINE_Y - frac * FALL_BAND_OSU * S;
}

// IBeatmapDifficultyInfo.DifficultyRange — two-piece linear, non-floored double. Catch's
// fall time uses this raw (not the (int)-floored TimePreempt) value.
function difficultyRange(diff: number, min: number, mid: number, max: number): number {
  if (diff > 5) return mid + (max - mid) * (diff - 5) / 5;
  if (diff < 5) return mid + (mid - min) * (diff - 5) / 5;
  return mid;
}

// On-screen fall duration (top of the visible band → catch line): DifficultyRange(AR,1800,1200,
// 450) in beatmap-ms. modDiff.ar carries HR/EZ scaling; DT/HT change the playback rate, not
// the beatmap-ms band, so this is correct in our beatmap-time render clock.
function fallTimeMs(ar: number): number {
  return difficultyRange(ar, 1800, 1200, 450);
}

// Hidden fade (CatchModHidden): a falling object fades out as it nears the catcher —
// FadeOut starts at StartTime − 0.6·TimePreempt and completes (alpha 0) at StartTime −
// 0.44·TimePreempt (linear, no easing — verified against ppy/osu master). TimePreempt is the
// same DifficultyRange(AR) that drives the fall band, so time-to-catch = frac·fallMs and the
// boundaries collapse to frac 0.6 (fade start) → 0.44 (invisible). Applies to every palpable
// object including bananas (CatchModHidden hits all DrawableCatchHitObject). Returns the alpha
// multiplier ∈ [0,1].
function hdFadeAlpha(frac: number): number {
  if (frac >= 0.6) return 1;
  if (frac <= 0.44) return 0;
  return (frac - 0.44) / 0.16;
}

// CalculateCatchWidth(difficulty) = BASE_SIZE · |CalculateScaleFromCircleSize(cs)·2| · 0.8.
// The catcher's *catch range* — "fruit within this width ⇒ caught". (The lazer catcher
// *visual* is wider, BASE_SIZE·scaleX with no ·0.8 — that's the skinned sprite; see
// catcherVisualWidthOsu.)
function catchWidthOsu(cs: number): number {
  return CATCHER_BASE_SIZE * Math.abs(calculateScaleFromCircleSize(cs) * 2) * ALLOWED_CATCH_RANGE;
}

// ---- Deterministic per-object visual randomness ----
// Lazer drives fruit rotation / banana colour+scale+rotation off RandomSeed = (int)StartTime via
// StatelessRNG so the look is stable on rewind. We reproduce the *determinism* (the actual
// requirement) with a small integer hash rather than a byte-exact StatelessRNG port —
// pixel-identical rotation is not required, only stability on scrub. Returns [0,1).
function randomSingle(seed: number, series: number): number {
  let h = (Math.imul(Math.trunc(seed) | 0, 2654435761) + Math.imul(series | 0, 40503)) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 3266489917) >>> 0;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// ---- Combo / banana colours ----
// Default catch combo palette (same baseline std uses); skin combo colours override.
const DEFAULT_COMBO_COLORS = ['#e879a0', '#68b3f0', '#f7e04a', '#90e070', '#f08040'];
// Banana 3-yellow palette, picked by RandomSeed (lazer's Banana.cs).
const BANANA_COLORS = ['rgb(255,240,0)', 'rgb(255,192,0)', 'rgb(214,221,28)'];
const HYPER_COLOR = 'rgb(255,0,0)'; // Catcher.DEFAULT_HYPER_DASH_COLOUR

function comboColorFor(session: CatchSession, indexInBeatmap: number): string {
  const palette = session.skin.config.comboColors.length > 0
    ? session.skin.config.comboColors
    : DEFAULT_COMBO_COLORS;
  // GetSkinComboColour(this, skin, IndexInBeatmap + 1) — catch cycles the palette per top-level
  // object (every fruit a different colour), unlike std's per-new-combo advance.
  return palette[(indexInBeatmap + 1) % palette.length]!;
}

// ---- Fruit pulp formations (lazer's procedural FruitPulpFormation) ----
const RADIUS_ADJUST = 1.1;
const LARGE_PULP_3 = 16 * RADIUS_ADJUST;          // 17.6
const LARGE_PULP_4 = LARGE_PULP_3 * 0.925;        // ≈16.28
const SMALL_PULP = 8 * RADIUS_ADJUST;             // 8.8
const DIST_3 = 0.15;
const DIST_4 = 0.15 / 0.925;                       // ≈0.162
const BORDER_THICKNESS = 6 * RADIUS_ADJUST;        // 6.6 (BorderPiece)
const HYPER_BORDER_THICKNESS = 12 * RADIUS_ADJUST; // 13.2 (HyperBorderPiece)

interface PulpLayout {
  topSmall: readonly [number, number]; // relative (fraction of the 128 box)
  largeAngles: readonly number[];       // degrees
  largeSize: number;                    // local px (in the 128 box)
  largeDist: number;                    // relative
}
// FruitVisualRepresentation order: Pear=0, Grape=1, Pineapple=2, Raspberry=3 (idx % 4).
const PULP_LAYOUTS: readonly PulpLayout[] = [
  { topSmall: [0, -0.33], largeAngles: [60, 180, 300],      largeSize: LARGE_PULP_3, largeDist: DIST_3 },
  { topSmall: [0, -0.25], largeAngles: [0, 120, 240],       largeSize: LARGE_PULP_3, largeDist: DIST_3 },
  { topSmall: [0, -0.30], largeAngles: [45, 135, 225, 315], largeSize: LARGE_PULP_4, largeDist: DIST_4 },
  { topSmall: [0, -0.34], largeAngles: [0, 90, 180, 270],   largeSize: LARGE_PULP_4, largeDist: DIST_4 },
];

// PositionAt(angle°, dist) = (dist·sin, dist·cos) in relative axes.
function pulpOffset(angleDeg: number, dist: number): [number, number] {
  const a = (angleDeg * Math.PI) / 180;
  return [dist * Math.sin(a), dist * Math.cos(a)];
}

// One additive white pulp with an accent-tinted glow (lazer's Pulp = White.Opacity(0.9) over
// an accent edge-effect glow).
function drawPulp(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, accent: string): void {
  ctx.save();
  // Respect the ambient alpha (Hidden fade): all absolute alphas are scaled by it. a == 1 when
  // not HD-faded, so this is a no-op on the normal path.
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
  const fruitScale = obj.scale * S;          // CalculateScaleFromCircleSize(cs), no ×2 (the ×2 is catcher-only)
  const boxR = OBJECT_RADIUS * fruitScale;    // 64·scale·S — the BorderPiece radius
  const layout = PULP_LAYOUTS[obj.indexInBeatmap % 4]!;
  const rotation = ((randomSingle(obj.startTime, 1) - 0.5) * 40 * Math.PI) / 180; // ±20° static

  ctx.save();
  const a = ctx.globalAlpha; // ambient HD-fade alpha
  ctx.translate(cx, cy);
  ctx.rotate(rotation);

  // Pulp formation (rotates with the fruit).
  const largeR = layout.largeSize * 0.5 * fruitScale;
  for (const ang of layout.largeAngles) {
    const [ox, oy] = pulpOffset(ang, layout.largeDist);
    drawPulp(ctx, ox * boxR * 2, oy * boxR * 2, largeR, accent);
  }
  drawPulp(ctx, layout.topSmall[0] * boxR * 2, layout.topSmall[1] * boxR * 2, SMALL_PULP * 0.5 * fruitScale, accent);

  // BorderPiece: white ring, fades out over the last 500 ms before the line.
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

  // Hyperdash: thick red ring + faint additive red fill.
  if (obj.hyperDash) drawHyperRing(ctx, boxR, HYPER_BORDER_THICKNESS * fruitScale);

  ctx.restore();
}

function drawHyperRing(ctx: CanvasRenderingContext2D, boxR: number, thickness: number): void {
  ctx.save();
  // Faint additive red fill. Scaled by the ambient HD-fade alpha; the ring stroke below
  // runs at that same alpha (restore returns to it).
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
  // DropletPiece box = OBJECT_RADIUS/2 = 32; tiny droplets are half via ScaleFactor.
  const factor = obj.type === 'tinyDroplet' ? 0.5 : 1;
  const r = (OBJECT_RADIUS / 4) * obj.scale * factor * S; // (32/2)·scale·factor·S
  ctx.save();
  const a = ctx.globalAlpha; // ambient HD-fade alpha
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.9 * a;
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // Non-tiny droplets can be hyper (red droplet ring).
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
  // preemptProgress ≈ 1 - frac: grows from startScale → 0.6, rotates start → end.
  const p = Math.max(0, Math.min(1, 1 - frac));
  const startScale = 0.6 + 1.6 * randomSingle(seed, 3);
  const scale = (startScale + (0.6 - startScale) * p);
  const startAngle = 180 * (randomSingle(seed, 1) * 2 - 1);
  const endAngle = 180 * (randomSingle(seed, 2) * 2 - 1);
  const rot = ((startAngle + (endAngle - startAngle) * p) * Math.PI) / 180;

  const boxR = OBJECT_RADIUS * obj.scale * scale * S;
  ctx.save();
  const a = ctx.globalAlpha; // ambient HD-fade alpha
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  // Banana body: a coloured pulp cluster (BananaPulpFormation) approximated as a filled disc.
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.9 * a;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, 0, boxR * 0.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  // White border ring.
  ctx.globalAlpha = a;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = BORDER_THICKNESS * obj.scale * scale * S;
  ctx.beginPath();
  ctx.arc(0, 0, boxR - (BORDER_THICKNESS * obj.scale * scale * S) / 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// ============================================================================
// Legacy fruit/droplet/banana sprites (CatchLegacySkinTransformer)
// ============================================================================
// Each palpable object renders from skin sprites when the skin provides them, falling
// through to the procedural geometry above PER COMPONENT — e.g. a skin with fruit-pear but
// no fruit-bananas draws sprite fruit + procedural bananas.
//
// A legacy piece (LegacyCatchHitObjectPiece) = combo-tinted base + untinted overlay +
// additive 1.2× red hyper glow. Sprites draw at their intrinsic logical size · object scale
// (lazer sizes the sprite by the texture, not the OBJECT_RADIUS box): the fruit textures are
// 128 logical px = OBJECT_RADIUS·2, so a fruit fills the same footprint the procedural
// BorderPiece does, while the teardrop fruit-drop keeps its own aspect (·0.8, LegacyDropletPiece).

interface LegacySprite { bitmap: ImageBitmap; logW: number; logH: number; }

// Resolve a legacy sprite, preferring @2x. The store halves @2x to logical px, so logW/logH are
// the resolution-independent logical (osu-px) dims and the on-screen size is the same whichever
// served. undefined ⇒ the skin lacks the stem ⇒ caller falls back to the procedural geometry.
function skinSprite(skin: SkinAssets, stem: string): LegacySprite | undefined {
  const hi = skin.images.get(`${stem}@2x.png`);
  if (hi !== undefined) return { bitmap: hi, logW: hi.width / 2, logH: hi.height / 2 };
  const lo = skin.images.get(`${stem}.png`);
  if (lo !== undefined) return { bitmap: lo, logW: lo.width, logH: lo.height };
  return undefined;
}

// FruitVisualRepresentation order Pear=0, Grape=1, Pineapple=2, Raspberry=3 → legacy filenames.
// Note the enum↔file mismatch: Pineapple→fruit-apple, Raspberry→fruit-orange.
const LEGACY_FRUIT_STEMS = ['fruit-pear', 'fruit-grapes', 'fruit-apple', 'fruit-orange'] as const;
const HYPER_HEX = '#ff0000'; // Catcher.DEFAULT_HYPER_DASH_COLOUR (CatchSkinColour.HyperDashFruit ?? Red)
// The banana yellows as hex (the rgb() forms drive the procedural BananaPiece; the legacy
// base is multiply-tinted so it needs hex): rgb(255,240,0)/rgb(255,192,0)/rgb(214,221,28).
const BANANA_TINTS = ['#fff000', '#ffc000', '#d6dd1c'];

// Draw a legacy piece centred at the current origin (caller has applied translate + rotation):
// combo-tinted base, untinted overlay, optional additive 1.2× red hyper glow. Each sprite is
// sized from its OWN logical dims · pxPerOsu. Hyper glow draws first (Depth = 1 → behind) at the
// LegacyCatchHitObjectPiece α 0.7.
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
  // base/overlay drawImage below inherit the ambient alpha; only the additive hyper glow sets an
  // absolute alpha, so scale it by the ambient (Hidden fade / the plate-burst fade). 1 normally.
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

// Returns false (→ procedural fallback) when the skin lacks the fruit sprite for this rep.
function drawLegacyFruit(
  ctx: CanvasRenderingContext2D, session: CatchSession, cx: number, cy: number, obj: CatchObject,
): boolean {
  const base = skinSprite(session.skin, LEGACY_FRUIT_STEMS[obj.indexInBeatmap % 4]!);
  if (base === undefined) return false;
  const overlay = skinSprite(session.skin, `${LEGACY_FRUIT_STEMS[obj.indexInBeatmap % 4]!}-overlay`);
  // Static ±20° rotation (set once in UpdateInitialTransforms; skin-independent).
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
  const tinyFactor = obj.type === 'tinyDroplet' ? 0.5 : 1; // DrawableTinyDroplet ScaleFactor
  // Continuous spin: startRotation 0..20°, lerp to +720° over the preempt window. Visible
  // on the teardrop fruit-drop (the procedural circle omits it). preemptProgress from frac.
  const startRot = randomSingle(obj.startTime, 1) * 20;
  const preemptProgress = (fallMs * (1 - frac)) / (fallMs + 2000);
  const rotation = ((startRot + 720 * preemptProgress) * Math.PI) / 180;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotation);
  // LegacyDropletPiece Scale = 0.8; only non-tiny droplets can be hyper.
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
  // Grow/shrink + spin (same anim as the procedural BananaPiece): startScale 0.6..2.2 → 0.6,
  // rotate startAngle → endAngle, both lerped by preemptProgress ≈ 1 − frac.
  const p = Math.max(0, Math.min(1, 1 - frac));
  const startScale = 0.6 + 1.6 * randomSingle(seed, 3);
  const scaleAnim = startScale + (0.6 - startScale) * p;
  const startAngle = 180 * (randomSingle(seed, 1) * 2 - 1);
  const endAngle = 180 * (randomSingle(seed, 2) * 2 - 1);
  const rotation = ((startAngle + (endAngle - startAngle) * p) * Math.PI) / 180;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotation);
  blitPiece(ctx, base, overlay, obj.scale * S * scaleAnim, tint, false); // bananas never hyper
  ctx.restore();
  return true;
}

// ============================================================================
// Catcher sprite, states & feedback
// ============================================================================

// Catcher *visual* width = BASE_SIZE · scaleX (no ×0.8): the sprite is 1/ALLOWED_CATCH_RANGE
// wider than the catch *range* — do not use the range width for the sprite. The catcher
// sprite texture's own aspect ratio gives its height.
function catcherVisualWidthOsu(cs: number): number {
  return catchWidthOsu(cs) / ALLOWED_CATCH_RANGE;
}

// The catcher sprite's catch surface (the bowl rim — the widest opaque row) sits at logical
// y = 16, i.e. lazer's LegacyCatcher `OriginPosition.Y = 16f`. We anchor THAT point to the
// catch line so fruit land on the rim; the body (legs) extends below and is clipped by the canvas
// bottom, the same place the in-game catcher sits. (Anchoring the sprite *top* to the line
// instead drops the rim ~8 px below where fruit land, reading as "catcher too low".)
const CATCHER_RIM_Y = 16;
// Catcher framing tunables. CATCHER_SCALE shrinks the whole sprite; CATCHER_TOP_OFFSET
// nudges it vertically vs the rim-aligned baseline. Both default to the faithful values.
const CATCHER_SCALE = 1.0;
const CATCHER_TOP_OFFSET = 0;

// Old-style legacy catcher selection: osu! picks LegacyCatcherOld (the single `fruit-ryuuta`
// sprite) over the new-style fruit-catcher-{idle,fail,kiai} when the skin's `Version` < 2.3
// AND it ships `fruit-ryuuta`. A missing Version line defaults to 1.0 (matches ppy/osu
// LegacySkinDecoder), so an old skin with no Version still resolves to the old catcher. A
// merged skin carries the SELECTED skin's config (SkinLoader merges overlay.config), and
// `fruit-ryuuta` is not part of the baseline asset set — so its presence here means the
// selected skin shipped it. Same '' → 1.0 / 'latest' → ∞ parse as taiko's skinVersionAsNumber.
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

const HYPER_TRANSITION_MS = 180;   // Catcher.HYPER_DASH_TRANSITION_DURATION
          // CatcherArea.trail_generation_interval
         // CatcherTrail dash/hyper FadeOut duration
        // CatcherTrail HyperDashAfterImage duration
             // DefaultHitExplosion duration

function outQuint(p: number): number {
  const x = p < 0 ? 0 : p > 1 ? 1 : p;
  const inv = 1 - x;
  return 1 - inv * inv * inv * inv * inv;
}
// Easing.OutSine / Easing.InSine — used by the plate-clear explode arc.



// Resolve a skin sprite (prefer @2x); aspect is read off the bitmap so the draw size is
// independent of which resolution served. Returns undefined when the skin lacks the sprite.
function skinImg(skin: SkinAssets, stem: string): ImageBitmap | undefined {
  return skin.images.get(`${stem}@2x.png`) ?? skin.images.get(`${stem}.png`);
}

// Multiplicative tint cache, keyed (bitmap, hex). Canvas has no built-in multiply tint, so we
// composite into a scratch canvas the first time we see each (sprite, colour) pair — same shape
// as the mania Playfield's tintSprite. Used for the combo-tinted legacy fruit base, the
// banana yellow tint, the additive red hyper glow, and the catcher hyperdash white→red fade.
const tintCache = new WeakMap<ImageBitmap, Map<string, OffscreenCanvas>>();
function tintSprite(bitmap: ImageBitmap, tintHex: string): CanvasImageSource {
  let bucket = tintCache.get(bitmap);
  if (bucket === undefined) { bucket = new Map(); tintCache.set(bitmap, bucket); }
  const cached = bucket.get(tintHex);
  if (cached !== undefined) return cached;
  // OffscreenCanvas (not document.createElement) so this path also works in the export worker.
  const c = new OffscreenCanvas(bitmap.width, bitmap.height);
  const cx = c.getContext('2d');
  if (cx === null) return bitmap;
  cx.drawImage(bitmap, 0, 0);
  cx.globalCompositeOperation = 'multiply';
  cx.fillStyle = tintHex;
  cx.fillRect(0, 0, c.width, c.height);
  cx.globalCompositeOperation = 'destination-in'; // re-mask to the sprite's alpha
  cx.drawImage(bitmap, 0, 0);
  bucket.set(tintHex, c);
  return c;
}

// The catcher hyperdash fade overlays this red-multiplied copy at alpha = factor: base·(1−f) +
// redTinted·f leaves R untouched and scales G/B by (1−f) — exactly a multiplicative lerp toward
// red (also colours the hyper trails/afterimages).
function redTinted(bitmap: ImageBitmap): CanvasImageSource {
  return tintSprite(bitmap, '#ff0000');
}

// ---- Per-session derived visual state (reconstructed from time) ----
type CatcherState = 'idle' | 'fail' | 'kiai';
interface HyperWindow { start: number; end: number; }
interface CaughtObj { time: number; x: number; type: CatchObjectType; scale: number; indexInBeatmap: number; combo: number; }
interface PlatedFruit extends CaughtObj { explodeAt: number; }
interface CatchVisualState {
  // Catcher animation-state changes in time order; state(t) = last entry ≤ t (default idle).
  stateChanges: { time: number; state: CatcherState }[];
  // Hyperdash activations: a CAUGHT hyper fruit/droplet → its next fruit/non-tiny-droplet target.
  hypers: HyperWindow[];
  // Caught fruit/droplet/banana (judgement > 0), time-sorted — drives the hit explosion.
  caught: CaughtObj[];
  // LastInCombo plate-clear times: the catcher dumps its pile on each.
  clearTimes: number[];
  // Caught fruit only (the pile), time-sorted, each tagged with the clear time it bursts at.
  plated: PlatedFruit[];
}

const _visualCache = new WeakMap<CatchSession, CatchVisualState>();

// Active kiai flag at `time`: the most recent timing point at or before it (kiai rides both
// red and green lines). Linear scan — timing-point counts are small.
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

  // hitResults are emitted in start-time order, the SAME stable sort sortedObjects() applies,
  // so result[i] ↔ sorted[i]. Pair them to recover each object's caught flag + render fields.
  const sorted = sortedObjects(session);
  const results = session.hitResults;

  const stateChanges: { time: number; state: CatcherState }[] = [];
  const caught: CaughtObj[] = [];
  // Running combo (fruit/droplet only; tiny/banana are comboIgnore) for the hit-explosion size
  // — lazer's LegacyHitExplosion scales by clamp(ComboAtJudgement/200, 0.35, 1.125).
  let combo = 0;
  for (let i = 0; i < sorted.length; i++) {
    const obj = sorted[i]!;
    const caughtHit = (results[i]?.judgement ?? 0) > 0;
    // Caught non-banana → Kiai (if in a kiai section) else Idle; missed non-banana → Fail.
    // Bananas never change catcher state.
    if (obj.type === 'fruit' || obj.type === 'droplet') {
      stateChanges.push({
        time: obj.startTime,
        state: caughtHit ? (kiaiAt(session, obj.startTime) ? 'kiai' : 'idle') : 'fail',
      });
      combo = caughtHit ? combo + 1 : 0;
    }
    if (caughtHit && obj.type !== 'tinyDroplet') {
      caught.push({ time: obj.startTime, x: obj.effectiveX, type: obj.type, scale: obj.scale, indexInBeatmap: obj.indexInBeatmap, combo });
    }
  }

  // Hyperdash windows: walk the fruit + non-tiny-droplet subsequence (the set initialiseHyperDash
  // pairs). A caught hyper object launches a dash to the NEXT object in that subsequence; the
  // catcher reaches it ~at that object's start time, so [thisStart, nextStart] is the red window.
  const hypers: HyperWindow[] = [];
  let prevIdx = -1;
  for (let i = 0; i < sorted.length; i++) {
    const obj = sorted[i]!;
    if (obj.type !== 'fruit' && obj.type !== 'droplet') continue; // skip tiny + banana
    if (prevIdx >= 0) {
      const prev = sorted[prevIdx]!;
      if (prev.hyperDash && (results[prevIdx]?.judgement ?? 0) > 0) {
        hypers.push({ start: prev.startTime, end: obj.startTime });
      }
    }
    prevIdx = i;
  }

  // Plate-clear times: the catcher dumps its pile on each LastInCombo object — the last
  // top-level object before a NewCombo (or the final object). Derive combo groups from the
  // top-level NewCombo flags (objects sharing a sourceIndex are one group, contiguous in
  // generation order; a spinner/BananaShower has no NewCombo field so it's treated as starting a
  // fresh combo). Clear time = the group's last palpable child time (a slider clears at its tail).
  const groups: { newCombo: boolean; endTime: number }[] = [];
  let curSource = -1;
  for (const obj of session.objects) {
    if (obj.sourceIndex !== curSource) {
      curSource = obj.sourceIndex;
      const src = session.beatmap.hitObjects[obj.sourceIndex];
      const nc = src !== undefined && (src.type === 'circle' || src.type === 'slider') ? src.newCombo : true;
      groups.push({ newCombo: nc, endTime: obj.startTime });
    } else {
      const g = groups[groups.length - 1]!;
      if (obj.startTime > g.endTime) g.endTime = obj.startTime;
    }
  }
  const clearTimes: number[] = [];
  for (let i = 0; i < groups.length; i++) {
    if (i === groups.length - 1 || groups[i + 1]!.newCombo) clearTimes.push(groups[i]!.endTime);
  }
  clearTimes.sort((a, b) => a - b);

  // Tag each caught fruit (only fruit pile on the plate) with the clear time it bursts at — the
  // first clearTime ≥ its catch time. explodeAt is non-decreasing across the time-sorted list.
  const plated: PlatedFruit[] = [];
  for (const c of caught) {
    if (c.type !== 'fruit') continue;
    let lo = 0, hi = clearTimes.length - 1, ex = Infinity;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (clearTimes[mid]! >= c.time) { ex = clearTimes[mid]!; hi = mid - 1; } else lo = mid + 1;
    }
    plated.push({ ...c, explodeAt: ex });
  }

  vs = { stateChanges, hypers, caught, clearTimes, plated };
  _visualCache.set(session, vs);
  return vs;
}

// Catcher animation state at t (binary search the change list).
function catcherStateAt(vs: CatchVisualState, t: number): CatcherState {
  const a = vs.stateChanges;
  let lo = 0, hi = a.length - 1, res = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (a[mid]!.time <= t) { res = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return res < 0 ? 'idle' : a[res]!.state;
}

// Hyperdash red factor at t ∈ [0,1]: ramp 0→1 over 180 ms (OutQuint) on entry, hold 1 while
// dashing to the target, ramp 1→0 over 180 ms after. Windows are non-overlapping with ascending
// ends, so the window containing t (if any) is the last with start ≤ t; scan back from there only
// while a window's out-phase still reaches t (so two rapid hypers cross-fade red without a dip).
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
    if (h.end + HYPER_TRANSITION_MS < t) break; // earlier ends are even smaller → done
    if (t <= h.end) f = Math.max(f, outQuint((t - h.start) / HYPER_TRANSITION_MS));
    else f = Math.max(f, 1 - outQuint((t - h.end) / HYPER_TRANSITION_MS));
  }
  return f;
}

// Visual facing (+1 right / −1 left) from recent catcher motion; widen the lookback until the
// movement is meaningful, default right. Drives the horizontal sprite flip (lazer's VisualDirection).
function facingAt(path: readonly CatcherFrame[], t: number): number {
  const now = sampleCatcherX(path, t);
  for (const w of [24, 60, 140, 320]) {
    const dx = now - sampleCatcherX(path, t - w);
    if (dx > 2) return 1;
    if (dx < -2) return -1;
  }
  return 1;
}

// Dash bit of the catcher-path segment active at t (the decoded dash flag is per-segment, like X).


// Draw the catcher body sprite (scaled to the visual width, aspect from the texture, top edge at
// the catch line, flipped to `facing`). `extraTint` overlays the red-tinted copy at that alpha
// for the hyperdash colour fade. `additive`+`alpha` are used by trails/afterimages.
function blitCatcher(
  ctx: CanvasRenderingContext2D,
  bitmap: ImageBitmap,
  centreX: number,
  topY: number,
  widthScreen: number,
  facing: number,
  opts: { alpha?: number; additive?: boolean; extraTint?: number; tintFull?: boolean } = {},
): void {
  const dw = widthScreen;
  const dh = widthScreen * (bitmap.height / bitmap.width);
  ctx.save();
  if (opts.additive) ctx.globalCompositeOperation = 'lighter';
  if (opts.alpha !== undefined) ctx.globalAlpha = opts.alpha;
  ctx.translate(centreX, topY);
  ctx.scale(facing, 1);
  const src: CanvasImageSource = opts.tintFull ? redTinted(bitmap) : bitmap;
  ctx.drawImage(src, -dw / 2, 0, dw, dh);
  // Hyperdash white→red fade: overlay the red-tinted copy at alpha = factor.
  if (opts.extraTint !== undefined && opts.extraTint > 0.02 && !opts.tintFull) {
    ctx.globalAlpha = (opts.alpha ?? 1) * opts.extraTint;
    ctx.drawImage(redTinted(bitmap), -dw / 2, 0, dw, dh);
  }
  ctx.restore();
}

// Dash trail: additive frozen catcher copies on a 16 ms grid back through the 800 ms fade
// window, only where the catcher was dashing/hyperdashing then. Grid-aligned so it's stable on
// rewind. Red while that emit moment was hyperdashing.
function drawDashTrail(
  ctx: CanvasRenderingContext2D,
  session: CatchSession,
  vs: CatchVisualState,
  idle: ImageBitmap,
  timeMs: number,
  topY: number,
  widthScreen: number,
): void {
  // The built-in preview keeps feedback local; this legacy effect is disabled.
}

// Hyperdash afterimage: one rising, expanding, fading red ghost per transition into
// hyperdash, over 1200 ms from each window start (frozen at the launch X).
function drawHyperAfterimages(
  ctx: CanvasRenderingContext2D,
  session: CatchSession,
  vs: CatchVisualState,
  idle: ImageBitmap,
  timeMs: number,
  topY: number,
  widthScreen: number,
): void {
  // The built-in preview keeps feedback local; this legacy effect is disabled.
}

// ---- Legacy hit explosion (lazer's LegacyHitExplosion) ----
 // explosion1 (scoreboard-explosion-2): FadeOutFromOne(300)
   // explosion2 (scoreboard-explosion-1): FadeOutFromOne(700)

// Draw one explosion sprite emanating UPWARD from the catch point (px, CATCH_LINE_Y). lazer sets
// Origin = CentreLeft, Rotation = -90°, Additive — so the sprite's width axis (local +X) points up
// and its height axis becomes the on-screen horizontal spread. `unit` = the explosion's effective
// px-per-sprite-unit (LegacyHitExplosion Scale 0.5 · catcher Scale (=scale·2) · playfield S =
// fruitScale · S). Tinted by the object colour.


// Legacy hit explosion (LegacyHitExplosion): on each caught fruit/droplet/banana, a glow
// (scoreboard-explosion-1) + a fruit/banana-only upward "juice streak" (scoreboard-explosion-2,
// skipped for droplets), tinted by the object colour, scaled by clamp(combo/200, 0.35, 1.125). The
// explosion is a child of the catcher in lazer, so it rides the moving plate at the catch X. Falls
// back to the procedural radial splash if the skin lacks the scoreboard-explosion sprites.
function drawHitExplosions(
  ctx: CanvasRenderingContext2D, session: CatchSession, vs: CatchVisualState, timeMs: number, catcherX: number,
): void {
  // The built-in preview keeps feedback local; this legacy effect is disabled.
}

// Catch splash — the procedural radial fallback when a skin lacks the scoreboard-explosion
// sprites: an additive, horizontally-stretched glow at each caught object's catch point,
// expanding (×5 on X) and fading over 400 ms.




// Caught-fruit pile + plate clear. Caught fruit rest in the bowl (just above the catch line,
// lazer's caughtObjectContainer Origin = BottomCentre, Y = -5) at the X where they landed on the
// (moving) plate (positionInStack ≈ object.X − catcher.X), drawn over the catcher body so they sit
// in the opening. They stay there — NOT fading — until the combo ends (a LastInCombo object), when
// the whole pile bursts: each fruit sprays outward to X + landOffset·6 over 1000 ms, arcs up 50 then
// down 50 (OutSine→InSine), and fades over 750 ms (Catcher.Explode). The burst detaches from the
// catcher (frozen at the catch X at clear time). Droplets explode on catch (never piled); bananas
// aren't piled. We approximate the unbounded lazer pile with the most recent PLATE_MAX per state.
     // Catcher.clearPlate FadeOut(750)

         // Catcher caughtObjectContainer Y = -5 (rests just above the rim)
function drawCaughtPlate(
  ctx: CanvasRenderingContext2D,
  session: CatchSession,
  vs: CatchVisualState,
  timeMs: number,
  catcherX: number,
): void {
  // The built-in preview keeps feedback local; this legacy effect is disabled.
}

// A small static caught fruit at caught_fruit_scale_adjust = 0.5 — legacy sprite when the skin
// ships it (no hyper glow / overlay tint on the plate), else the procedural pulp formation.


// Start-time-sorted view, cached per session (objects are stored in generation order so the
// position pass can walk them; rendering needs a time-ordered window). Built lazily on
// first draw and reused every frame.
const _sortedCache = new WeakMap<CatchSession, readonly CatchObject[]>();
function sortedObjects(session: CatchSession): readonly CatchObject[] {
  let s = _sortedCache.get(session);
  if (s === undefined) {
    s = [...session.objects].sort((a, b) => a.startTime - b.startTime);
    _sortedCache.set(session, s);
  }
  return s;
}

// Largest index with startTime <= t (or -1).
function lastIndexAtOrBefore(objs: readonly CatchObject[], t: number): number {
  let lo = 0, hi = objs.length - 1, res = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (objs[mid]!.startTime <= t) { res = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return res;
}
// Smallest index with startTime >= t (or objs.length).
function firstIndexAtOrAfter(objs: readonly CatchObject[], t: number): number {
  let lo = 0, hi = objs.length - 1, res = objs.length;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (objs[mid]!.startTime >= t) { res = mid; hi = mid - 1; } else lo = mid + 1;
  }
  return res;
}

// Flashlight, built lazily per session — only FL replays pay the cost. The size timeline
// reads the combo timeline; the catch playfield scale S converts the osu-px sizes to screen px.
const _flCache = new WeakMap<CatchSession, CatchFlashlight>();
function catchFlashlight(session: CatchSession): CatchFlashlight {
  let fl = _flCache.get(session);
  if (fl === undefined) {
    fl = new CatchFlashlight(session.beatmap, session.comboFrames, S);
    _flCache.set(session, fl);
  }
  return fl;
}

// Catcher sprite + the full feedback stack, in z-order: trail (behind) → afterimage →
// catcher body (with the hyperdash red fade) → caught-fruit plate → catch splash.
function drawCatcherAndFeedback(ctx: CanvasRenderingContext2D, session: CatchSession, timeMs: number): void {
  const cs = session.modDiff.cs;
  const path = session.catcherPath;
  const vs = visualState(session);
  const catcherX = sampleCatcherX(path, timeMs);
  const widthScreen = catcherVisualWidthOsu(cs) * S * CATCHER_SCALE;

  // Old-style skins use the single `fruit-ryuuta` sprite for every state; new-style skins
  // use the per-state fruit-catcher-{idle,fail,kiai} set (each state falling back to idle, like
  // LegacyCatcherNew). The rim-at-y16 alignment, width, direction flip, and trail/afterimage below
  // are shared — only the body/idle sprite source differs.
  const old = isOldStyleCatcher(session.skin);
  const stem = old ? 'fruit-ryuuta' : 'fruit-catcher-idle';
  const dims = skinSprite(session.skin, stem);
  const idle = skinImg(session.skin, stem);
  const state = catcherStateAt(vs, timeMs);
  const body = old ? idle : (skinImg(session.skin, `fruit-catcher-${state}`) ?? idle);
  if (body === undefined || idle === undefined || dims === undefined) return; // skin lacks a catcher sprite — nothing to draw

  // Anchor the bowl rim (logical y = CATCHER_RIM_Y) to the catch line. dh is the sprite's screen
  // height; the rim sits dh·(rimY/logH) below the sprite top, so lift the top by that much.
  const dh = widthScreen * (dims.logH / dims.logW);
  const topY = CATCH_LINE_Y - dh * (CATCHER_RIM_Y / dims.logH) + CATCHER_TOP_OFFSET;

  drawDashTrail(ctx, session, vs, idle, timeMs, topY, widthScreen);
  drawHyperAfterimages(ctx, session, vs, idle, timeMs, topY, widthScreen);
  blitCatcher(ctx, body, screenX(catcherX), topY, widthScreen, facingAt(path, timeMs),
    { extraTint: hyperFactorAt(vs, timeMs) });
  // Caught fruit rest in the bowl (drawn over the body), then the upward hit explosion.
  drawCaughtPlate(ctx, session, vs, timeMs, catcherX);
  drawHitExplosions(ctx, session, vs, timeMs, catcherX);
}

/**
 * Draw the complete catch playfield for one frame at `timeMs` (beatmap ms): falling objects,
 * the replay-driven catcher + feedback, optional Hidden/Flashlight mod effects, and the
 * catcher-tracking combo counter. Pure function of (session, timeMs, options) apart from
 * lazily-built per-session caches, so it is scrub/rewind-safe.
 */
export function drawCatchPlayfield(ctx: CanvasRenderingContext2D, session: CatchSession, timeMs: number, options: RenderOptions): void {
  const { modDiff } = session;
  const fallMs = fallTimeMs(modDiff.ar);

  // Visible window: an object is on-screen iff its frac ∈ [0,1], i.e. startTime ∈ [now, now+fallMs]
  // (Constant scroll). Objects past the line (frac<0) are culled — caught/missed objects vanish.
  const objs = sortedObjects(session);
  const lo = firstIndexAtOrAfter(objs, timeMs);
  const hi = lastIndexAtOrBefore(objs, timeMs + fallMs);

  // Draw far→near (earlier-spawned, lower on screen, drawn last so nearer fruit sit on top):
  // iterate descending startTime so the closest-to-line object paints last.
  for (let i = hi; i >= lo; i--) {
    const obj = objs[i]!;
    const frac = (obj.startTime - timeMs) / fallMs;
    if (frac < 0 || frac > 1) continue;
    // Hidden: fade objects out as they near the catcher. The draw helpers honour the
    // ambient globalAlpha, so set it once here; fully-faded objects are skipped entirely.
    const hd = options.modHidden ? hdFadeAlpha(frac) : 1;
    if (hd <= 0) continue;
    ctx.globalAlpha = hd;
    const cy = screenYFromFrac(frac);
    const cx = screenX(obj.effectiveX);
    // Legacy sprite per component when the skin ships it, else the procedural draw.
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

  // Catcher sprite + feedback, driven by the interpolated replay X.
  drawCatcherAndFeedback(ctx, session, timeMs);

  // Flashlight: a circular reveal centred on the catcher, darkening everything else.
  // Drawn after the playfield + catcher (so both are darkened) but before the combo + the
  // Renderer's score/acc HUD (which stay bright above it). Only constructed when enabled.
  if (options.modFlashlight) {
    const catcherX = sampleCatcherX(session.catcherPath, timeMs);
    catchFlashlight(session).draw(ctx, timeMs, screenX(catcherX), CATCH_LINE_Y);
  }

  // Combo counter (mania-style glyphs — the Renderer skips the std bottom-left combo for
  // mode 2). Lazer's CatchComboDisplay tracks the catcher's X (comboDisplay.X = Catcher.X) and sits a
  // fixed height above the catch line (see COMBO_CENTRE_ABOVE_LINE_OSU) — so follow the catcher X and
  // hold that Y.
  const comboX = sampleCatcherX(session.catcherPath, timeMs);
  drawManiaCombo(ctx, session.comboFrames, timeMs, screenX(comboX), CATCH_LINE_Y - COMBO_CENTRE_ABOVE_LINE_OSU * S, session.skin);
}
