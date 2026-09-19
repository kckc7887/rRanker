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
import { visibleManiaObjects, maniaRenderSession, resolveTrackOpacity } from "../../../engine-performance";
import type { SkinAssets, ManiaSkinSection, HitResult } from '../../types/index';
import type { ManiaSession, ManiaStage, ManiaBarLine } from './types';
import type { ManiaScroll } from './scroll';
import type { RenderOptions } from '../../renderer/Renderer';
import { scrollRawAt, scrollTimeAtRaw } from './scroll';
import { drawManiaCombo } from '../../renderer/HUDRenderer';

// Mania playfield renderer: static stage layout, sequential-scroll note
// positioning, legacy skin.ini wiring ([Mania] section fields + legacy sprite
// filename fallbacks), and the visual-feedback layer (receptors, lights,
// explosions, popups). Geometry and behaviour are ported from ppy/osu's legacy
// mania skinning classes, cited inline where relevant.

const LOGICAL_W = 1280;
const LOGICAL_H = 720;

// Lazer constants in 768-space; we render at 720-tall and treat one of our
// pixels as one lazer pixel. Visual error vs lazer's 768-tall playfield: <7%.
const COLUMN_WIDTH         = 80;
const SPECIAL_COLUMN_WIDTH = 70;
// Default ColumnSpacing in lazer's `LegacyManiaSkinConfiguration` is 0 (the
// `float[keys-1]` array is allocated but never `Fill`ed, while ColumnWidth /
// ColumnLineWidth are explicitly filled with non-zero defaults). Columns are
// flush by default; any positive gap is a skin.ini choice.
const COLUMN_SPACING       = 0;
// Default (non-legacy-skin) HIT_TARGET_POSITION = 110px from the bottom.
const HIT_TARGET_OFFSET_FROM_BOTTOM = 110;
// LegacyManiaSkinConfiguration.LightPosition default: `(480 - 413) * 1.6 = 107.2`
// (lazer 768-space). In our 720-space: `(480 - 413) * 1.5 = 100.5` px from the
// column bottom — the bottom edge of the press-light sprite sits *here*, not at
// the hit line.

// MAX_TIME_RANGE in ms: ScrollSpeed control maps speed → 11485/speed ms of lookahead.
const MAX_TIME_RANGE = 11485;

// 480-px-space (skin.ini) → 720-px-space (our canvas). Lazer uses 1.6 (480→768);
// 1.5 keeps the ratio exact for our 720-tall canvas.
const SKIN_SCALE = LOGICAL_H / 480;

// Legacy skin sprites carry their dimensions in lazer's 768-tall gameplay space,
// whereas our column/hit-line geometry is built in 480→720 space (SKIN_SCALE). A
// sprite drawn at raw native height therefore lives in a 6.7%-larger space than
// the notes (sized from col.width). For a bottom-anchored receptor this offsets
// its ring a few px above where notes land at the hit line, so the circle note no
// longer sits inside the circle receptor. Mapping native heights 768→720 puts
// them in one coordinate system. (= SKIN_SCALE / 1.6.)
const LAZER_SPRITE_SCALE = LOGICAL_H / 768;

// LegacyManiaSkinConfiguration defaults for stage-chrome drawing.
//   ColumnLineWidth: lazer's `new float[keys + 1]` is `Fill(2)`-ed → default 2 px per line.
//   ColourColumnLine + JudgementLineColour: default `Color4.White` (lazer applies
//     `LegacyColourCompatibility.ApplyWithDoubledAlpha`; for opaque white that's a no-op).
//   JudgementLine: lazer default ON (drawn at alpha 0.9).
//   Column-line `Box.Scale = (0.740, 1)` — drawn width is 0.74 × ColumnLineWidth[i].
const DEFAULT_COLUMN_LINE_WIDTH = 2;
const DEFAULT_COLUMN_LINE_COLOUR = '#ffffffff';
const DEFAULT_JUDGEMENT_LINE_COLOUR = '#ffffffff';
const JUDGEMENT_LINE_ALPHA = 0.9;
const JUDGEMENT_LINE_HEIGHT = 2;
const COLUMN_LINE_SCALE_X = 0.740;

// `LegacyManiaSkinConfiguration` initialises `LightFramePerSecond = 60`. The
// decoder clamps a parsed value to 24 only when ≤ 0. So our consumer default
// (when the section omits the key entirely) is 60.


// NoteBodyStyle enum (LegacyNoteBodyStyle). All three "repeat" variants collapse
// into a single tile-from-head path in lazer (LegacyBodyPiece.cs ~line 200).
const BODY_STYLE_STRETCH = 0;

// A hold-note body sprite at least this many times taller than wide is treated as
// a "full-length" body (a tall strip with a designed cap/tip at the top, like this
// skin's 128×40000 "Pointy" LNB) rather than a short tileable/stretchable segment
// (e.g. R Skin's 256×82). Full-length bodies are drawn top-anchored at native
// scale so their top cap shows; segments keep the Stretch default. No real segment
// body is 4× taller than wide, so the split is unambiguous.
const TALL_BODY_ASPECT = 4;

export interface ManiaColumnLayout {
  /** Left edge in logical-canvas px. */
  x: number;
  width: number;
  /** Fallback texture suffix for default `mania-{note,key}{N}` filenames. */
  textureSuffix: '1' | '2' | 'S';
  isSpecial: boolean;
  /**
   * Resolved per-column sprite stems (already lower-cased; ready for skin lookup).
   * Each preserves the lazer fallback chain (see resolveColumnStems below).
   */
  noteStem: string;
  headStem: string;
  tailStem: string;       // resolves to head's stem when no `T` variant exists
  bodyStem: string;
  keyStem: string;
  keyDownStem: string;
}

export interface ManiaLayout {
  /** Per absolute column index. */
  columns: readonly ManiaColumnLayout[];
  stageLeftX: number;
  stageRightX: number;
  /** Y of the hit line (where notes are judged). */
  hitTargetY: number;
  /** Pixel length of the scroll axis (top → hit line). */
  scrollLength: number;
}

function isSpecialColumn(stage: ManiaStage, absCol: number): boolean {
  if (stage.columns % 2 !== 1) return false;
  const offset = absCol - stage.firstColumnIndex;
  return offset === Math.floor(stage.columns / 2);
}

function textureSuffixFor(stage: ManiaStage, absCol: number): '1' | '2' | 'S' {
  if (isSpecialColumn(stage, absCol)) return 'S';
  const distLeft  = absCol - stage.firstColumnIndex;
  const distRight = stage.firstColumnIndex + stage.columns - 1 - absCol;
  const distToEdge = Math.min(distLeft, distRight);
  return distToEdge % 2 === 0 ? '1' : '2';
}

/**
 * Pick the [Mania] section matching `totalColumns`, mirroring lazer's
 * LegacyManiaSkinDecoder behavior (`Keys == TotalColumns`). Returns undefined
 * if the skin has no matching section — caller falls back to mania-defaults.
 */
function findManiaSection(skin: SkinAssets | undefined, totalColumns: number): ManiaSkinSection | undefined {
  const sections = skin?.config.maniaSections;
  if (sections === undefined) return undefined;
  for (const s of sections) if (s.keys === totalColumns) return s;
  return undefined;
}

/**
 * Whether the skin requests upscroll (`UpsideDown: 1` in the matched [Mania]
 * section). Seeds the Upscroll render-option default at session build — the user
 * can still flip it. Skins without a matching section default to downscroll.
 */
export function maniaSkinUpsideDown(skin: SkinAssets | undefined, totalColumns: number): boolean {
  return findManiaSection(skin, totalColumns)?.upsideDown === true;
}

/**
 * True iff the body should tile (RepeatTop/Bottom/Both).
 *
 * Lazer's `LegacyManiaSkinConfiguration.NoteBodyStyle` is nullable with no
 * default and no version gate; when unspecified it falls into `LegacyBodyPiece`'s
 * `default:` branch (`WrapMode.Repeat` + `Scale.Y = 32800/DrawHeight`). In
 * practice the lazer tile is imperceptible — most legacy L sprites are
 * full-body animation frames designed to be played in sequence, not tileable
 * strips, and stretching them produces the clean in-game appearance the user
 * sees. Spatially tiling those frames on a 2D canvas reproduces every soft
 * top-edge fade as a visible horizontal seam (the "stacked notes" artefact on
 * Default and similar skins). We therefore default to **Stretch** and tile only
 * when the skin explicitly asks via `NoteBodyStyle: 2/3/4`. With
 * `resolveBodySprite` cycling the L animation frames over time at lazer's
 * `frameLength: 30`, the body still subtly pulses — matching what lazer renders.
 */
function bodyStyleIsRepeat(section: ManiaSkinSection | undefined): boolean {
  const explicit = section?.noteBodyStyle;
  return explicit !== undefined && explicit !== BODY_STYLE_STRETCH;
}

/**
 * Stage-light frame rate. Lazer's `LegacyColumnBackground` reads
 * `LegacyManiaSkinConfigurationLookups.LightFramePerSecond`; the decoder clamps
 * parsed-zero-or-negative to 24, and the in-memory default is 60.
 */


/**
 * Lazer's per-column image resolution:
 *   1. Explicit `NoteImage{i}` in the matched [Mania] section (0-based, absolute).
 *   2. Otherwise the default-skin filename `mania-note{suffix}`.
 * Head/Tail follow longer fallback chains so skins that only ship `NoteImage{i}`
 * still get a working head/tail.
 *
 * Note: fallback stems are written lowercase because the skin loader
 * normalises every image-map key to lowercase. Without the lowercase, `mania-noteS`
 * misses the actually-present `mania-notes.png`.
 */
function resolveColumnStems(
  section: ManiaSkinSection | undefined,
  absCol: number,
  suffix: '1' | '2' | 'S',
): {
  noteStem: string;
  headStem: string;
  tailStem: string;
  bodyStem: string;
  keyStem: string;
  keyDownStem: string;
} {
  const sfx = suffix.toLowerCase();
  const lookups = section?.imageLookups;
  const noteKey      = `noteimage${absCol}`;
  const noteHeadKey  = `noteimage${absCol}h`;
  const noteTailKey  = `noteimage${absCol}t`;
  const noteBodyKey  = `noteimage${absCol}l`;
  const keyKey       = `keyimage${absCol}`;
  const keyDownKey   = `keyimage${absCol}d`;

  const explicitNote = lookups?.[noteKey];
  const explicitHead = lookups?.[noteHeadKey];
  const explicitTail = lookups?.[noteTailKey];
  const explicitBody = lookups?.[noteBodyKey];
  const explicitKey  = lookups?.[keyKey];
  const explicitKD   = lookups?.[keyDownKey];

  const bodyStem = explicitBody ?? `mania-note${sfx}l`;

  const noteStem = explicitNote ?? `mania-note${sfx}`;

  // Head: explicit `NoteImage{i}H`, else fall through to the plain note image
  // (skins commonly ship only NoteImage{i} and rely on this).
  const headStem = explicitHead ?? explicitNote ?? `mania-note${sfx}h`;

  // Tail: explicit `NoteImage{i}T`, else explicit `NoteImage{i}H`, else explicit
  // `NoteImage{i}`, else `mania-note{suffix}t` (rarely shipped by skins;
  // Playfield will render-time flip the head when no tail sprite resolves).
  const tailStem = explicitTail ?? explicitHead ?? explicitNote ?? `mania-note${sfx}t`;

  const keyStem     = explicitKey ?? `mania-key${sfx}`;
  const keyDownStem = explicitKD  ?? `mania-key${sfx}d`;

  return { noteStem, headStem, tailStem, bodyStem, keyStem, keyDownStem };
}

/**
 * Compute the static playfield geometry (per-column x/width, resolved sprite
 * stems, hit-line Y) for a column count + optional skin. All values are in the
 * renderer's 1280×720 logical-pixel space; skin.ini values (480-space) are
 * scaled in here. Built once per session and treated as immutable.
 */
export function buildManiaLayout(
  stages: readonly ManiaStage[],
  totalColumns: number,
  skin: SkinAssets | undefined,
): ManiaLayout {
  const section = findManiaSection(skin, totalColumns);

  // Per-column widths: skin > default. ColumnWidth from skin is in 480-space.
  // Per-column spacings: skin's `ColumnSpacing` is the gap *between* adjacent
  // columns (length usually `keys - 1`). We treat trailing missing entries as 0.
  const columnWidthsPx: number[] = new Array(totalColumns);
  const stage0 = stages[0]!;
  for (let c = 0; c < totalColumns; c++) {
    const special = isSpecialColumn(stage0, c);
    const skinW = section?.columnWidth?.[c];
    columnWidthsPx[c] = skinW !== undefined && skinW > 0
      ? skinW * SKIN_SCALE
      : (special ? SPECIAL_COLUMN_WIDTH : COLUMN_WIDTH);
  }
  const columnSpacingsPx: number[] = new Array(Math.max(0, totalColumns - 1));
  for (let i = 0; i < columnSpacingsPx.length; i++) {
    const skinSpacing = section?.columnSpacing?.[i];
    columnSpacingsPx[i] = skinSpacing !== undefined && skinSpacing > 0
      ? skinSpacing * SKIN_SCALE
      : COLUMN_SPACING;
  }

  let stageContentWidth = 0;
  for (let c = 0; c < totalColumns; c++) {
    stageContentWidth += columnWidthsPx[c]!;
    if (c < totalColumns - 1) stageContentWidth += columnSpacingsPx[c]!;
  }

  // Stage horizontal position: we always centre. Lazer's `ColumnStart` is an
  // offset within a letterboxed playfield container — replicating it correctly
  // would require the playfield-vs-screen letterbox, which is not modelled.
  // Centring is the safe, conventional behaviour for replay viewing.
  const stageLeftX = Math.round((LOGICAL_W - stageContentWidth) / 2);

  const columns: ManiaColumnLayout[] = new Array(totalColumns);
  let cursor = stageLeftX;
  for (let c = 0; c < totalColumns; c++) {
    const special = isSpecialColumn(stage0, c);
    const suffix = textureSuffixFor(stage0, c);
    const stems  = resolveColumnStems(section, c, suffix);
    columns[c] = {
      x: cursor,
      width: columnWidthsPx[c]!,
      isSpecial: special,
      textureSuffix: suffix,
      ...stems,
    };
    cursor += columnWidthsPx[c]!;
    if (c < totalColumns - 1) cursor += columnSpacingsPx[c]!;
  }

  // HitPosition: lazer maps the 480-space skin.ini value as `(480 - clamp(val, 240, 480)) * 1.6`
  // (480→768); SKIN_SCALE is our 720-space equivalent. Result = distance from the bottom.
  let hitOffsetFromBottom = HIT_TARGET_OFFSET_FROM_BOTTOM;
  if (section?.hitPosition !== undefined) {
    const clamped = Math.max(240, Math.min(480, section.hitPosition));
    hitOffsetFromBottom = (480 - clamped) * SKIN_SCALE;
  }
  const hitTargetY = LOGICAL_H - hitOffsetFromBottom;

  return {
    columns,
    stageLeftX,
    stageRightX: cursor,
    hitTargetY,
    scrollLength: hitTargetY,
  };
}

// SequentialScrollAlgorithm (mania uses Sequential, not Constant):
//   position = (relRaw(objectTime) - relRaw(currentTime)) / timeRange * scrollLength
//   y        = hitTargetY - position
// `relRaw(currentTime)` is hoisted to `rNow` (computed once per frame). With a
// single multiplier-1 control point this collapses exactly to the old constant
// formula, so SV-free single-BPM maps are unchanged.
function positionYAt(
  scroll: ManiaScroll,
  rNow: number,
  objectTime: number,
  timeRange: number,
  layout: ManiaLayout,
): number {
  const position = (scrollRawAt(scroll, objectTime) - rNow) / timeRange * layout.scrollLength;
  return layout.hitTargetY - position;
}

// Visibility window in px (above the top edge / below the hit line) — converted to
// SV-aware beatmap-time bounds via the inverse scroll mapping. Mirrors the ±200 px
// per-object clamps in drawObjects with a little extra margin.
const VISIBLE_AHEAD_PX = 250;
const VISIBLE_BEHIND_PX = 300;

/** SV-aware [minTime, maxTime] visible beatmap-time window for the current frame. */
function visibleTimeWindow(
  scroll: ManiaScroll,
  rNow: number,
  timeRange: number,
  layout: ManiaLayout,
): { minTime: number; maxTime: number } {
  const rawPerPx = timeRange / layout.scrollLength;
  const maxTime = scrollTimeAtRaw(scroll, rNow + (layout.scrollLength + VISIBLE_AHEAD_PX) * rawPerPx);
  const minTime = scrollTimeAtRaw(scroll, rNow - VISIBLE_BEHIND_PX * rawPerPx);
  return { minTime, maxTime };
}

// Mirror osu!'s `LegacySkin.GetTexture`, which runs `componentName.Replace("@2x",
// "")` BEFORE re-appending `@2x` to locate the high-DPI file. So a skin.ini path
// that bakes in `@2x` (e.g. `KeyImage0: Circles/Receptors/pl0x/Receptor@2x`)
// resolves to `Receptor@2x.png` at HALF display size (ScaleAdjust 2) — identical
// to having written `Receptor`. Without this strip the `.png` branch below finds
// `Receptor@2x.png` at pixelScale 1.0 and draws the receptor at 2× its intended
// height (the "stretched + misplaced receptor" bug on stable-authored skins).
function stripAt2x(stem: string): string {
  return stem.replace(/@2x/gi, '');
}

function skinImg(skin: SkinAssets | undefined, stem: string): ImageBitmap | undefined {
  if (skin === undefined || stem === '') return undefined;
  const s = stripAt2x(stem);
  return skin.images.get(`${s}@2x.png`) ?? skin.images.get(`${s}.png`);
}

/** Resolve a sprite with its display-pixel-scale (@2x sprites are half-sized when drawn). */
function skinSpriteNatural(
  skin: SkinAssets | undefined,
  stem: string,
): { bitmap: ImageBitmap; pixelScale: number } | undefined {
  if (skin === undefined || stem === '') return undefined;
  const s = stripAt2x(stem);
  const at2x = skin.images.get(`${s}@2x.png`);
  if (at2x !== undefined && at2x.width > 1) return { bitmap: at2x, pixelScale: 0.5 };
  const at1x = skin.images.get(`${s}.png`);
  if (at1x !== undefined && at1x.width > 1) return { bitmap: at1x, pixelScale: 1.0 };
  return undefined;
}

/**
 * Receptor-stem resolver that honours the legacy "1×1 blank = suppress" convention
 * (`LegacyKeyArea`): a skin shipping `mania-key{N}` as a 1×1 transparent sprite
 * intends *no* receptor. `skinSpriteNatural` collapses that to `undefined` (same as
 * absent), which lets the Default receptor merged in for missing assets — or our
 * primitive fallback — leak back in. This keeps the three cases distinct:
 *   - shipped, real (width > 1) → `{bitmap, pixelScale}` (draw it)
 *   - shipped, 1×1 blank        → `null` (suppress; do NOT fall through)
 *   - not shipped at all        → `undefined` (caller tries the next candidate stem)
 */
function resolveReceptorSprite(
  skin: SkinAssets | undefined,
  stem: string,
): { bitmap: ImageBitmap; pixelScale: number } | null | undefined {
  if (skin === undefined || stem === '') return undefined;
  const s = stripAt2x(stem);
  const at2x = skin.images.get(`${s}@2x.png`);
  if (at2x !== undefined) return at2x.width > 1 ? { bitmap: at2x, pixelScale: 0.5 } : null;
  const at1x = skin.images.get(`${s}.png`);
  if (at1x !== undefined) return at1x.width > 1 ? { bitmap: at1x, pixelScale: 1.0 } : null;
  return undefined;
}

/**
 * Multiplicatively tint `bitmap` by `tintHex` ('#rrggbb' / '#rrggbbaa'), cached
 * per (bitmap, tint). Used for `mania-stage-light` ColourLight{i+1} tinting —
 * canvas has no built-in multiplicative tint, so we composite into a scratch
 * canvas the first time we see each (sprite, colour) pair.
 */



/**
 * Resolve one of the precomputed per-column stems through the skin's images map,
 * falling through a default-skin filename if the explicit stem doesn't exist.
 */
function resolveStem(
  skin: SkinAssets | undefined,
  primary: string,
  fallback?: string,
): ImageBitmap | undefined {
  const first = skinImg(skin, primary);
  if (first !== undefined) return first;
  if (fallback !== undefined && fallback !== primary) return skinImg(skin, fallback);
  return undefined;
}



function findVisibleBarLineRange(
  barLines: readonly ManiaBarLine[],
  minTime: number,
  maxTime: number,
): { firstIdx: number; lastIdx: number } {
  const n = barLines.length;
  if (n === 0) return { firstIdx: 0, lastIdx: -1 };
  let lo = 0, hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (barLines[mid]!.time < minTime) lo = mid + 1; else hi = mid;
  }
  const firstIdx = lo;
  if (firstIdx >= n || barLines[firstIdx]!.time > maxTime) {
    return { firstIdx, lastIdx: firstIdx - 1 };
  }
  lo = firstIdx; hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    if (barLines[mid]!.time <= maxTime) lo = mid; else hi = mid - 1;
  }
  return { firstIdx, lastIdx: lo };
}

function drawColumnBackground(
  ctx: CanvasRenderingContext2D,
  layout: ManiaLayout,
  section: ManiaSkinSection | undefined,
): void {
  // Stage-wide opaque backdrop spanning the whole stage rect (including any
  // ColumnSpacing gaps). Lazer's columns sit inside an opaque gameplay-area
  // backdrop, so spacings show solid dark rather than the page background.
  // Per-column `Colour{i+1}` boxes paint over this backdrop.
  ctx.fillStyle = 'rgb(0, 0, 0)';
  ctx.fillRect(layout.stageLeftX, 0, layout.stageRightX - layout.stageLeftX, LOGICAL_H);

  // Per-column background colours from the matched skin section (Colour{i+1});
  // fall back to a flat dark wash so columns are always distinguishable.
  for (let i = 0; i < layout.columns.length; i++) {
    const col = layout.columns[i]!;
    const colour = section?.colours[i];
    ctx.fillStyle = colour ?? 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(col.x, 0, col.width, LOGICAL_H);
  }
}

function drawStageChrome(
  ctx: CanvasRenderingContext2D,
  layout: ManiaLayout,
  skin: SkinAssets | undefined,
  section: ManiaSkinSection | undefined,
): void {
  const stageWidth = layout.stageRightX - layout.stageLeftX;

  // mania-stage-left / mania-stage-right: stretched vertically along the stage edges.
  // `StageLeft`/`StageRight` overrides win: a skin setting them to a 1×1 `blank`
  // suppresses the edge. We must NOT retry the default stem (nor draw the 1×1
  // sentinel), or a default-skin edge merged in for missing assets leaks back in.
  const leftStem  = section?.imageLookups['stageleft']  ?? 'mania-stage-left';
  const rightStem = section?.imageLookups['stageright'] ?? 'mania-stage-right';
  const leftSpr  = skinImg(skin, leftStem);
  const rightSpr = skinImg(skin, rightStem);
  if (leftSpr !== undefined && leftSpr.width > 1) {
    const aspect = leftSpr.width / leftSpr.height;
    const w = LOGICAL_H * aspect;
    ctx.drawImage(leftSpr, layout.stageLeftX - w, 0, w, LOGICAL_H);
  }
  if (rightSpr !== undefined && rightSpr.width > 1) {
    const aspect = rightSpr.width / rightSpr.height;
    const w = LOGICAL_H * aspect;
    ctx.drawImage(rightSpr, layout.stageRightX, 0, w, LOGICAL_H);
  }

  // mania-stage-hint: thin horizontal sprite drawn at the hit line, stretched to stage width.
  // `StageHint` override wins: a skin setting it to a 1×1 `blank` suppresses the bar.
  // We must NOT retry the `mania-stage-hint` default (nor draw the 1×1 sentinel), or a
  // default-skin stage-hint merged in for missing assets leaks back in as a spurious
  // pink/blue bar below the receptors — this also covers skins whose `blank.png` was
  // dropped during extraction, leaving the override stem unresolvable.
  const hintStem = section?.imageLookups['stagehint'] ?? 'mania-stage-hint';
  const hint = skinImg(skin, hintStem);
  if (hint !== undefined && hint.width > 1) {
    const aspect = hint.height / hint.width;
    const h = stageWidth * aspect;
    ctx.drawImage(hint, layout.stageLeftX, layout.hitTargetY - h / 2, stageWidth, h);
  }

  // LegacyStageBackground judgement line: a thin Box at the hit target, colour
  // `JudgementLineColour` (default white-with-alpha-doubled) drawn at alpha 0.9.
  // ON by default; only suppressed when the skin sets `JudgementLine: 0`.
  // Drawn whether or not a `mania-stage-hint` sprite is present (in lazer they
  // both render).
  const judgementLineOn = section?.judgementLine ?? true;
  if (judgementLineOn) {
    const colour = section?.judgementLineColour ?? DEFAULT_JUDGEMENT_LINE_COLOUR;
    const prevAlpha = ctx.globalAlpha;
    ctx.globalAlpha = prevAlpha * JUDGEMENT_LINE_ALPHA;
    ctx.fillStyle = colour;
    ctx.fillRect(
      layout.stageLeftX,
      layout.hitTargetY - JUDGEMENT_LINE_HEIGHT / 2,
      stageWidth,
      JUDGEMENT_LINE_HEIGHT,
    );
    ctx.globalAlpha = prevAlpha;
  }
}

/**
 * Vertical column-separator lines inside the stage. `ColumnLineWidth` is a
 * `keys+1` array (line at left edge of each column + the right edge of the
 * last). Lazer scales the `Box.Scale = (0.74, 1)`, so drawn width is
 * `0.74 × ColumnLineWidth[i]`. Lines run from the top of the stage down to the
 * hit target (NOT the full canvas — they live inside `HitTargetInsetContainer`).
 * Lines of width 0 are skipped.
 */
function drawColumnLines(
  ctx: CanvasRenderingContext2D,
  layout: ManiaLayout,
  section: ManiaSkinSection | undefined,
): void {
  const totalColumns = layout.columns.length;
  // Compute the positions of each gap (length keys+1). Skin's `ColumnLineWidth`
  // (also length keys+1) is consulted at each one. When the array is shorter
  // than keys+1 (skin error), missing entries default to 2.
  // Column gaps in lazer span the ColumnSpacing range *between* columns; we
  // centre the line on the boundary between consecutive columns.
  const widths = section?.columnLineWidth;
  const colour = section?.colourColumnLine ?? DEFAULT_COLUMN_LINE_COLOUR;
  for (let i = 0; i <= totalColumns; i++) {
    const raw = widths !== undefined ? widths[i] : DEFAULT_COLUMN_LINE_WIDTH;
    if (raw === undefined || raw <= 0) continue;
    // Skin widths are in 480-space; scale into canvas pixels then multiply by
    // lazer's hardcoded 0.74 horizontal scale.
    const w = raw * SKIN_SCALE * COLUMN_LINE_SCALE_X;
    let cx: number;
    if (i === 0) {
      cx = layout.columns[0]!.x;
    } else if (i === totalColumns) {
      cx = layout.columns[totalColumns - 1]!.x + layout.columns[totalColumns - 1]!.width;
    } else {
      const left = layout.columns[i - 1]!;
      const right = layout.columns[i]!;
      cx = (left.x + left.width + right.x) / 2;
    }
    ctx.fillStyle = colour;
    ctx.fillRect(cx - w / 2, 0, w, layout.hitTargetY);
  }
}

function drawStageBottom(
  ctx: CanvasRenderingContext2D,
  layout: ManiaLayout,
  skin: SkinAssets | undefined,
): void {
  const stageWidth = layout.stageRightX - layout.stageLeftX;
  const bottom = skinImg(skin, 'mania-stage-bottom');
  if (bottom !== undefined) {
    const aspect = bottom.height / bottom.width;
    const h = stageWidth * aspect;
    ctx.drawImage(bottom, layout.stageLeftX, LOGICAL_H - h, stageWidth, h);
  }
}

function drawKeyReceptors(
  ctx: CanvasRenderingContext2D,
  layout: ManiaLayout,
  skin: SkinAssets | undefined,
  heldByCol: readonly boolean[],
): void {
  // LegacyKeyArea (`osu.Game.Rulesets.Mania/Skinning/Legacy/LegacyKeyArea.cs`):
  // the sprite has `RelativeSizeAxes = Axes.X, Width = 1` (stretched to the
  // column width) with `Origin = BottomCentre` and **native pixel height**.
  // It is NOT stretched vertically to fill the hit area — its bottom edge is
  // pinned to the column bottom and its top sits at `columnBottom - nativeH`.
  // A tall key sprite naturally extends above the hit line by a few pixels;
  // a short one leaves transparent space above. This matches lazer exactly.
  const hitAreaH = LOGICAL_H - layout.hitTargetY;
  for (let i = 0; i < layout.columns.length; i++) {
    const col = layout.columns[i]!;
    const isHeld = heldByCol[i] === true;
    const stem = isHeld ? col.keyDownStem : col.keyStem;
    const fallback = isHeld
      ? `mania-key${col.textureSuffix.toLowerCase()}d`
      : `mania-key${col.textureSuffix.toLowerCase()}`;
    // First *present* stem decides — a shipped 1×1 suppresses the receptor (draw
    // nothing), matching stable, rather than falling through to the next stem or
    // the primitive (which surfaced the Default/primitive receptor on UI skins
    // like "Gavin [Jhown UI]" that blank `mania-key{1,2,S}`).
    let natural: { bitmap: ImageBitmap; pixelScale: number } | null | undefined;
    for (const cand of [stem, fallback, isHeld ? 'mania-key1d' : 'mania-key1']) {
      natural = resolveReceptorSprite(skin, cand);
      if (natural !== undefined) break;
    }
    if (natural != null) {
      const nativeH = natural.bitmap.height * natural.pixelScale * LAZER_SPRITE_SCALE;
      ctx.drawImage(natural.bitmap, col.x, LOGICAL_H - nativeH, col.width, nativeH);
    } else if (natural === undefined) {
      // No key sprite anywhere → primitive receptor (dev/edge skins only).
      ctx.fillStyle = isHeld ? 'rgba(160, 160, 200, 0.95)' : 'rgba(80, 80, 100, 0.85)';
      ctx.fillRect(col.x, layout.hitTargetY, col.width, hitAreaH);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 1;
      ctx.strokeRect(col.x + 0.5, layout.hitTargetY + 0.5, col.width - 1, hitAreaH - 1);
    }
    // natural === null → suppressed: draw nothing.
  }
}

function drawBarLines(
  ctx: CanvasRenderingContext2D,
  barLines: readonly ManiaBarLine[],
  scroll: ManiaScroll,
  rNow: number,
  timeRange: number,
  layout: ManiaLayout,
  section: ManiaSkinSection | undefined,
): void {
  // BarlineHeight: skin > default. Zero suppresses bar lines entirely (some skins
  // set BarlineHeight: 0 in every section), matching stable's behaviour.
  const barH = section?.barlineHeight ?? 1;
  if (barH <= 0) return;

  const { minTime, maxTime } = visibleTimeWindow(scroll, rNow, timeRange, layout);
  const { firstIdx, lastIdx } = findVisibleBarLineRange(barLines, minTime, maxTime);
  if (lastIdx < firstIdx) return;

  const x0 = layout.stageLeftX;
  const x1 = layout.stageRightX;
  for (let i = firstIdx; i <= lastIdx; i++) {
    const bl = barLines[i]!;
    const y = positionYAt(scroll, rNow, bl.time, timeRange, layout);
    if (y < -2 || y > layout.hitTargetY + 2) continue;
    if (bl.major) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.30)';
      ctx.fillRect(x0, y - barH, x1 - x0, barH * 2);
    } else {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.13)';
      ctx.fillRect(x0, y, x1 - x0, barH);
    }
  }
}

/**
 * LegacyNotePiece.Update formula:
 *   noteHeight = widthForNoteHeightScale ?? DrawWidth   // 480-space (×SKIN_SCALE for us)
 *   sprite.Scale = ( DrawWidth, noteHeight ) / tex.DisplayWidth
 *   ⇒ drawn height = (noteHeight / tex.w) * tex.h
 * When `WidthForNoteHeightScale` is unset, the height divisor is the column's
 * drawn width — i.e. a plain aspect-preserving scale.
 */
function noteSpriteHeight(
  width: number,
  sprite: ImageBitmap | undefined,
  widthForNoteHeightScale: number | undefined,
): number {
  if (sprite === undefined) return Math.round(width * 0.35);
  const heightBasis = widthForNoteHeightScale !== undefined
    ? widthForNoteHeightScale * SKIN_SCALE
    : width;
  return heightBasis * (sprite.height / sprite.width);
}

function drawTapNote(
  ctx: CanvasRenderingContext2D,
  col: ManiaColumnLayout,
  yBottom: number,
  skin: SkinAssets | undefined,
  widthForNoteHeightScale: number | undefined,
): void {
  const spr = resolveStem(skin, col.noteStem, `mania-note${col.textureSuffix.toLowerCase()}`)
    ?? skinImg(skin, 'mania-note1');
  const h = noteSpriteHeight(col.width, spr, widthForNoteHeightScale);
  // Down scroll: the note's BottomCentre is anchored at the scroll Y position.
  if (spr !== undefined) {
    ctx.drawImage(spr, col.x, yBottom - h, col.width, h);
  } else {
    ctx.fillStyle = 'rgba(220, 230, 255, 0.95)';
    ctx.fillRect(col.x, yBottom - h, col.width, h);
  }
}

/** lazer's `LegacyBodyPiece` body-animation frame length (~33 fps). */
const BODY_ANIMATION_FRAME_MS = 30;

/**
 * Resolve the body sprite for a hold note. Mirrors lazer's
 * `LegacyBodyPiece` `skin.GetAnimation(imageName, ..., frameLength: 30)` —
 * tries the explicit stem (single or `-N` frames), then the default-skin
 * filename. Default's L body, for example, ships ONLY as `mania-note1l-0..5`,
 * never as a bare `mania-note1l`, so we need the frame-sequence path here.
 * Picks the current frame from the gameplay clock; all on-screen bodies are in
 * phase (matches lazer's parent-clock-driven animation).
 */
function resolveBodySprite(
  skin: SkinAssets | undefined,
  primaryStem: string,
  fallbackStem: string,
  timeMs: number,
): ImageBitmap | undefined {
  const tryStem = (stem: string): ImageBitmap | undefined => {
    if (skin === undefined || stem === '') return undefined;
    const direct = skinImg(skin, stem);
    if (direct !== undefined) return direct;
    const frames = resolveSkinFrames(skin, stem);
    if (frames.length === 0) return undefined;
    const idx = Math.floor(timeMs / BODY_ANIMATION_FRAME_MS) % frames.length;
    return frames[idx >= 0 ? idx : idx + frames.length]!.bitmap;
  };
  return tryStem(primaryStem) ?? tryStem(fallbackStem);
}

function drawHoldNote(
  ctx: CanvasRenderingContext2D,
  col: ManiaColumnLayout,
  yHead: number,
  yTail: number,
  skin: SkinAssets | undefined,
  widthForNoteHeightScale: number | undefined,
  bodyRepeats: boolean,
  timeMs: number,
): void {
  // yHead/yTail = bottom-Y of head/tail at their respective scroll positions.
  // In Down scroll, future times sit higher, so yTail < yHead.
  const headSpr = resolveStem(skin, col.headStem, `mania-note${col.textureSuffix.toLowerCase()}`)
    ?? skinImg(skin, 'mania-note1');
  // Body source: explicit L sprite (single or animated frame sequence), else
  // the head/note image stretched as the body. Lazer's `LegacyBodyPiece` draws
  // NOTHING when the L sprite is missing, but that looks broken for legacy
  // skins that ship head sprites only; the head-as-body fallback gives users a
  // body coloured like the rest of the note instead of the dev-time fill
  // primitive we used to paint.
  const bodySpr = resolveBodySprite(
    skin,
    col.bodyStem,
    `mania-note${col.textureSuffix.toLowerCase()}l`,
    timeMs,
  ) ?? skinImg(skin, 'mania-note1l') ?? headSpr;
  const headH = noteSpriteHeight(col.width, headSpr, widthForNoteHeightScale);
  // Tail: try the explicit T stem, else flip the head — most legacy skins ship
  // no T sprites and rely on the runtime flipping the head/note sprite.
  const explicitTailSpr = col.tailStem !== col.headStem
    ? resolveStem(skin, col.tailStem)
    : undefined;
  const tailSpr = explicitTailSpr ?? headSpr;
  const tailH = noteSpriteHeight(col.width, tailSpr, widthForNoteHeightScale);

  // Body spans from the centre of the tail to the centre of the head, so it tucks
  // half under both pieces (matching lazer's hold-note body geometry).
  const bodyTopY    = yTail - tailH / 2;
  const bodyBottomY = yHead - headH / 2;
  const bodyH       = bodyBottomY - bodyTopY;
  if (bodyH > 0 && bodySpr !== undefined) {
    if (bodySpr.height >= bodySpr.width * TALL_BODY_ASPECT) {
      // Tall full-length body sprite (e.g. this skin's 128×40000 "Pointy" LNB,
      // whose arrowhead cap occupies the top ~100 px). lazer's `LegacyBodyPiece`
      // draws the body Anchor.TopCentre at ~native scale, so the texture's TOP (the
      // cap/arrowhead) renders at the tail end and the solid stem extends down to
      // the head. Stretching the whole texture into the note length (the default
      // branch below) squashes that cap to a sub-pixel sliver — the LN reads as a
      // plain rectangle with no tip. Draw it top-anchored at its width-fitted
      // native height, clipped to the body band: one draw, no tiling → no seams.
      // (max() guards the impossible note-longer-than-the-texture case.)
      const nativeFitH = col.width * (bodySpr.height / bodySpr.width);
      ctx.save();
      ctx.beginPath();
      ctx.rect(col.x, bodyTopY, col.width, bodyH);
      ctx.clip();
      ctx.drawImage(bodySpr, col.x, bodyTopY, col.width, Math.max(nativeFitH, bodyH));
      ctx.restore();
    } else if (bodyRepeats) {
      // LegacyBodyPiece (RepeatTop/RepeatBottom/RepeatTopAndBottom all collapse
      // to one path in lazer): tile the body sprite at its column-fitted size
      // starting from the head end (bottom in Down scroll). We replicate by
      // computing the per-tile height = bodySpr.height × (col.width / bodySpr.width)
      // and stacking tiles from `bodyBottomY` upward, clipping the last tile.
      const tileH = col.width * (bodySpr.height / bodySpr.width);
      if (tileH > 0) {
        // Clip to the body band so the bottom-most partial tile gets cut at the
        // head-centre line (since we lay tiles starting from there going up).
        ctx.save();
        ctx.beginPath();
        ctx.rect(col.x, bodyTopY, col.width, bodyH);
        ctx.clip();
        for (let y = bodyBottomY; y > bodyTopY; y -= tileH) {
          ctx.drawImage(bodySpr, col.x, y - tileH, col.width, tileH);
        }
        ctx.restore();
      }
    } else {
      // Stretch (default for skin v<2.5): single sprite stretched to body length.
      ctx.drawImage(bodySpr, col.x, bodyTopY, col.width, bodyH);
    }
  }

  // Tail is ALWAYS vertically flipped in Down-scroll, even when an explicit
  // `NoteImage{i}T` sprite resolves. `LegacyHoldNoteTailPiece.OnDirectionChanged`
  // inverts the scroll direction before applying the base note-piece flip — so
  // skins author tail sprites expecting the runtime to flip them on draw. An
  // explicit tail drawn unflipped (e.g. Hiroshi's `Arrownote/noteT.png`, an
  // upward-pointing arrow) would point the wrong way.
  if (tailSpr !== undefined) {
    ctx.save();
    ctx.translate(col.x + col.width / 2, yTail - tailH / 2);
    ctx.scale(1, -1);
    ctx.drawImage(tailSpr, -col.width / 2, -tailH / 2, col.width, tailH);
    ctx.restore();
  } else {
    ctx.fillStyle = 'rgba(220, 230, 255, 0.95)';
    ctx.fillRect(col.x, yTail - tailH, col.width, tailH);
  }

  // Head: drawn last so it sits on top of the body.
  if (headSpr !== undefined) {
    ctx.drawImage(headSpr, col.x, yHead - headH, col.width, headH);
  } else {
    ctx.fillStyle = 'rgba(220, 230, 255, 0.95)';
    ctx.fillRect(col.x, yHead - headH, col.width, headH);
  }
}

function drawObjects(
  ctx: CanvasRenderingContext2D,
  session: ManiaSession,
  rNow: number,
  timeMs: number,
  timeRange: number,
  section: ManiaSkinSection | undefined,
): void {
  const { objects, layout, scroll, holdStates } = session;
  const { minTime, maxTime } = visibleTimeWindow(scroll, rNow, timeRange, layout);
  const visibleObjects = visibleManiaObjects(objects, minTime, maxTime);
  if (visibleObjects.length === 0) return;

  const bodyRepeats = bodyStyleIsRepeat(section);
  const heightScale = section?.widthForNoteHeightScale;

  for (const o of visibleObjects) {
    const col = layout.columns[o.column];
    if (col === undefined) continue;
    if (o.kind === 'note') {
      // Per-object reject: only the windowed range is in the index sweep.
      if (o.time < minTime) continue;
      // Lazer's `DrawableManiaHitObject.UpdateHitStateTransforms`: on a non-miss
      // `ArmedState.Hit`, the note does `FadeOut()` with no duration — instant
      // disappear at the press time. Missed notes (`ArmedState.Miss`) fade out
      // over 150 ms while continuing to scroll, so we keep them visible.
      const r = session.noteResultByIndex.get(o.sourceIndex);
      if (r !== undefined && r.judgement > 0 && timeMs >= r.time) continue;
      const y = positionYAt(scroll, rNow, o.time, timeRange, layout);
      if (y < -200 || y > layout.hitTargetY + 200) continue;
      drawTapNote(ctx, col, y, session.skin, heightScale);
    } else {
      // Per-object reject: a hold is visible iff its endTime hasn't passed `minTime`.
      if (o.endTime < minTime) continue;
      const yTail = positionYAt(scroll, rNow, o.endTime, timeRange, layout);
      if (yTail > layout.hitTargetY + 200) continue;

      const st = holdStates.get(o.sourceIndex);
      const headHit = st !== undefined && st.headJudgement > 0 && st.pressedAt !== null;
      const releasedAt = st?.releasedAt ?? null;
      // Completion = the moment the hold ends: the release, or endTime if the user
      // held all the way through.
      const completionTime = releasedAt ?? o.endTime;

      // Any hold whose head was hit vanishes at the judgement line the instant it
      // completes, exactly like a tap note (lazer's `DrawableManiaHitObject` does an
      // instant `FadeOut()` on the parent hold at `ArmedState.Hit`). We cull it
      // outright so the body never scrolls past the line. We deliberately cull
      // *dropped* holds here too: a hold our judge flags broken (an early/late
      // release classified as a body break) would otherwise draw unpinned past the
      // release and its tail would dip below the line — which read as the LN "falling
      // through." The combo-break + judgement popup already convey the drop, so a
      // replay reads cleaner with the LN simply gone at the line. (Head-missed holds
      // are NOT culled — they were never hit, so they scroll + fade like any miss.)
      if (headHit && timeMs >= completionTime) continue;

      // Held-shrink: while the user is holding (head was hit and they haven't
      // released), the head freezes at the hit line and the body shrinks from the
      // still-scrolling tail down to the line — matching osu!'s held-LN visual.
      const isCurrentlyHeld = headHit
        && timeMs >= (st!.pressedAt as number)
        && timeMs < completionTime;

      let yHead: number;
      if (isCurrentlyHeld) {
        yHead = layout.hitTargetY;
      } else {
        yHead = positionYAt(scroll, rNow, o.startTime, timeRange, layout);
      }
      // While held, keep the tail from dipping below the hit line (a late-but-valid
      // release lands after endTime) so the body stays collapsed at the receptor.
      const yTailDraw = isCurrentlyHeld ? Math.min(yTail, layout.hitTargetY) : yTail;

      drawHoldNote(ctx, col, yHead, yTailDraw, session.skin, heightScale, bodyRepeats, timeMs);
    }
  }
}

// Visual feedback (hit explosions, hold/stage lights, key receptors, popups).
// References (ppy/osu):
//   - LegacyHitExplosion.cs        (hit explosion timing)
//   - LegacyColumnBackground.cs    (stage-light fade-in/fade-out)
//   - LegacyManiaJudgementPiece.cs (popup placement + transforms)
//   - LegacyKeyArea.cs             (key receptor up/down)

// Hit explosion / hold light:
//   FadeInFromZero(80).Then().FadeOut(120)  → 80ms in, 120ms out, ~200ms visible.



// Animation duration (regardless of frame count): max(1000/60, 170/frameCount).



// Stage press-light (column glow):
//   press → FadeIn instant + ScaleTo(1)
//   release → FadeTo(0, 250ms) + ScaleTo((1,0), 250ms)


// Judgement popup (LegacyManiaJudgementPiece):
//   FadeInFromZero(20).Then().Delay(160).FadeOutFromOne(40) → 220ms total.
const POPUP_FADE_IN_MS  = 20;
const POPUP_HOLD_MS     = 160;
const POPUP_FADE_OUT_MS = 40;
const POPUP_TOTAL_MS    = POPUP_FADE_IN_MS + POPUP_HOLD_MS + POPUP_FADE_OUT_MS;

interface PressIntervalLookup { start: number; end: number }

/**
 * Latest press interval at or before `time` for a column. Returns the interval
 * if `time ∈ [start, end)`, else returns the most recent interval that ended
 * before `time` (used for release-fade animations).
 */
function currentOrLastInterval(
  intervals: readonly PressIntervalLookup[],
  time: number,
): PressIntervalLookup | null {
  if (intervals.length === 0) return null;
  let lo = 0, hi = intervals.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (intervals[mid]!.start <= time) lo = mid + 1; else hi = mid;
  }
  return lo === 0 ? null : intervals[lo - 1]!;
}

/** Currently-held: true iff time ∈ [start, end). */
function isHeldAt(intervals: readonly PressIntervalLookup[], time: number): boolean {
  const iv = currentOrLastInterval(intervals, time);
  return iv !== null && time >= iv.start && time < iv.end;
}

/**
 * Resolve animation frames `stem-0`, `stem-1`, … else the single `stem`, each
 * with its display pixel scale. 1×1 sprites are filtered out — that's the
 * skin-author convention for "this asset is intentionally suppressed" (e.g.
 * R Skin v2.0 ships `lightingN-0.png` at 1×1 to disable hit explosions).
 */
type SkinFrame = { bitmap: ImageBitmap; pixelScale: number };
function resolveSkinFrames(
  skin: SkinAssets | undefined,
  stem: string,
): SkinFrame[] {
  if (skin === undefined || stem === '') return [];
  const frames: SkinFrame[] = [];
  for (let i = 0; ; i++) {
    const f = skinSpriteNatural(skin, `${stem}-${i}`);
    if (f === undefined) break;
    frames.push(f);
  }
  if (frames.length > 0) return frames;
  const single = skinSpriteNatural(skin, stem);
  return single !== undefined ? [single] : [];
}

/** lazer's per-frame length for hit explosion / hold light. */


/**
 * Frame index of an animation that started at `start`.
 * - Plays once and clamps to the last frame (`loop=false`, hit explosion + popup).
 * - Loops continuously (`loop=true`, hold light — lazer keeps `IsPlaying` looping
 *   while the LN is held).
 */
function pickFrame(
  frames: readonly SkinFrame[],
  ageMs: number,
  frameLenMs: number,
  loop = false,
): SkinFrame {
  if (frames.length === 1) return frames[0]!;
  const raw = Math.max(0, Math.floor(ageMs / frameLenMs));
  const idx = loop ? (raw % frames.length) : Math.min(frames.length - 1, raw);
  return frames[idx]!;
}

/** Draw a SkinFrame centered at (cx, cy) at its native pixel size × `scale`. */
function drawFrameNatural(
  ctx: CanvasRenderingContext2D,
  frame: SkinFrame,
  cx: number,
  cy: number,
  scale: number,
): void {
  const w = frame.bitmap.width * frame.pixelScale * scale;
  const h = frame.bitmap.height * frame.pixelScale * scale;
  ctx.drawImage(frame.bitmap, cx - w / 2, cy - h / 2, w, h);
}

/** Fade-in 80ms / fade-out 120ms (additive sprites). 0 outside [0, 200ms]. */


function drawHitExplosions(
  ctx: CanvasRenderingContext2D,
  session: ManiaSession,
  timeMs: number,
  section: ManiaSkinSection | undefined,
): void {
  // The built-in preview keeps feedback local; this legacy effect is disabled.
}

function drawHoldLights(
  ctx: CanvasRenderingContext2D,
  session: ManiaSession,
  timeMs: number,
  section: ManiaSkinSection | undefined,
): void {
  // The built-in preview keeps feedback local; this legacy effect is disabled.
}

function drawStageLights(
  ctx: CanvasRenderingContext2D,
  session: ManiaSession,
  timeMs: number,
  section: ManiaSkinSection | undefined,
): void {
  // The built-in preview keeps feedback local; this legacy effect is disabled.
}

function popupStemFor(judgement: HitResult['judgement']): string {
  switch (judgement) {
    case 305: return 'mania-hit300g';
    case 300: return 'mania-hit300';
    case 200: return 'mania-hit200';
    case 100: return 'mania-hit100';
    case 50:  return 'mania-hit50';
    default:  return 'mania-hit0';
  }
}

function popupTransform(ageMs: number, isMiss: boolean): { alpha: number; scale: number; rot: number } {
  if (ageMs < 0 || ageMs >= POPUP_TOTAL_MS) return { alpha: 0, scale: 1, rot: 0 };
  let alpha: number;
  if (ageMs < POPUP_FADE_IN_MS) {
    alpha = ageMs / POPUP_FADE_IN_MS;
  } else if (ageMs < POPUP_FADE_IN_MS + POPUP_HOLD_MS) {
    alpha = 1;
  } else {
    alpha = 1 - (ageMs - POPUP_FADE_IN_MS - POPUP_HOLD_MS) / POPUP_FADE_OUT_MS;
  }
  // Hit pulse 0.8→1→0.85→0.7→0.4; miss 1.2→1 + small rotation. Approximate the
  // hit pulse with a single ease: 0.8 → 1 quickly, then drift to 0.85 → 0.7.
  let scale: number; let rot = 0;
  if (isMiss) {
    const t = Math.min(1, ageMs / 80);
    scale = 1.2 - 0.2 * t;
    rot = 0;                 // random rotation is not deterministic on rewind — skip.
  } else {
    if (ageMs < 40)        scale = 0.8 + 0.2 * (ageMs / 40);          // 0.8 → 1.0
    else if (ageMs < 100)  scale = 1.0 - 0.15 * ((ageMs - 40) / 60);   // 1.0 → 0.85
    else                   scale = 0.85 - 0.45 * Math.min(1, (ageMs - 100) / (POPUP_TOTAL_MS - 100));
  }
  return { alpha, scale, rot };
}

function drawJudgementPopups(
  ctx: CanvasRenderingContext2D,
  session: ManiaSession,
  timeMs: number,
  section: ManiaSkinSection | undefined,
  upscroll: boolean,
): void {
  // Per LegacyManiaJudgementPiece: popups live at the stage level, not per
  // column. We render only the latest result whose [time, time+TOTAL] still
  // contains `timeMs`. (Multiple simultaneous columns produce stacked popups
  // in lazer; for simplicity we collapse to "most recent" — the user's eye
  // tracks one stage-wide popup anyway.)
  const { hitResults, layout } = session;
  if (hitResults.length === 0) return;

  const minT = timeMs - POPUP_TOTAL_MS;
  let lo = 0, hi = hitResults.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (hitResults[mid]!.time < minT) lo = mid + 1; else hi = mid;
  }

  // Skipping body sub-results (invisible — no popup sprite).
  let chosen: HitResult | null = null;
  for (let i = hitResults.length - 1; i >= lo; i--) {
    const r = hitResults[i]!;
    if (r.time > timeMs) continue;
    if (r.subResult === 'body') continue;
    chosen = r;
    break;
  }
  if (chosen === null) return;

  const age = timeMs - chosen.time;
  const isMiss = chosen.judgement === 0;
  const { alpha, scale } = popupTransform(age, isMiss);
  if (alpha <= 0) return;

  const stem = popupStemFor(chosen.judgement);
  const frames = resolveSkinFrames(session.skin, stem);
  if (frames.length === 0) return;          // 1×1 sentinels filtered in resolveSkinFrames
  // Multi-frame popups (e.g. mania-hit300g) play at ~20fps (50ms/frame).
  const frameLen = frames.length > 1 ? 50 : POPUP_TOTAL_MS;
  const frame = pickFrame(frames, age, frameLen);

  // Position: stage centre X. The lazer Judgements container is wrapped in a
  // `HitPositionPaddedContainer` with `Padding.Bottom = HitPosition` in
  // Down-scroll — so its bottom edge sits AT THE HIT LINE, not at canvas bottom.
  // `LegacyManiaJudgementPiece.onDirectionChanged` branches by
  // `scorePosition > hitPositionFromTop / 2` to choose between BottomCentre and
  // TopCentre anchors (which matters for the FadeIn/scale animation direction),
  // but BOTH branches resolve to the same final stage-top-relative centre:
  //
  //   Branch A: Anchor BottomCentre @ hitTargetY, Y = scorePos − hitPositionFromTop
  //             popupCentreY = hitTargetY + (scorePos − hitPositionFromTop) = scorePos
  //   Branch B: Anchor TopCentre @ 0,             Y = scorePos
  //             popupCentreY = scorePos
  //
  // So the simple, lazer-faithful formula is just `popupY = scorePos × SKIN_SCALE`.
  // `ScorePosition` is stored as `value × 1.6` by the lazer decoder (NOT
  // `(480 − value) × 1.6` like HitPosition / LightPosition). Default unset is
  // raw 300 → 450 px in our 720-space.
  const scorePositionPx = (section?.scorePosition ?? 300) * SKIN_SCALE;
  // Upscroll flips the popup's vertical placement (lazer's onDirectionChanged
  // swaps the anchor + inverts Y) while the sprite itself stays upright.
  const popupY = upscroll ? LOGICAL_H - scorePositionPx : scorePositionPx;
  const stageCx = (layout.stageLeftX + layout.stageRightX) / 2;

  const prevAlpha = ctx.globalAlpha;
  ctx.globalAlpha = prevAlpha * alpha;
  // Native sprite size × judgement-pulse `scale`. No stage-width clamping —
  // skins ship popups at the size they want shown.
  drawFrameNatural(ctx, frame, stageCx, popupY, scale);
  ctx.globalAlpha = prevAlpha;
}

/** Build the per-column "held now" array for receptor sprite swap. */
function computeHeldByColumn(session: ManiaSession, timeMs: number): boolean[] {
  const held = new Array<boolean>(session.totalColumns);
  for (let c = 0; c < session.totalColumns; c++) {
    held[c] = isHeldAt(session.pressIntervals[c] ?? [], timeMs);
  }
  return held;
}

// ── Cover mods (HD/FadeIn/Cover) + Flashlight ───────────────────────────────
// References: ppy/osu ManiaMod{Hidden,FadeIn,Cover,WithPlayfieldCover}.cs +
// UI/PlayfieldCoveringWrapper.cs (cover); Mods/ManiaModFlashlight.cs +
// Rulesets/Mods/ModFlashlight.cs (flashlight). All combo/break-driven sizing is
// evaluated instantaneously at `timeMs` (no 800 ms damping) — a replay viewer
// scrubs freely, so a deterministic per-frame value is preferable to an
// animation that wouldn't survive rewind (same stance as the popup miss-rotation skip).

// Lazer measures cover coverage and the flashlight band in a 768-px reference
// playfield; our canvas is 720 tall, so one lazer px ≈ LOGICAL_H/768 of our px.
const REFERENCE_PLAYFIELD_HEIGHT = 768;
const COVER_FADE_FRACTION = 0.25;            // gradient band = 25% of column height
const COVER_COMBO_MIN_PX = 160;
const COVER_COMBO_MAX_PX = 400;
const COVER_COMBO_INCREASE_PER_COMBO = 0.5;

const FL_DEFAULT_SIZE = 50;                  // ManiaModFlashlight.DefaultFlashlightSize
const FL_SMOOTHNESS = 1.1;                   // 10% soft edge
const FL_BREAK_MULTIPLIER = 2.5;
const FL_SCALE = LOGICAL_H / REFERENCE_PLAYFIELD_HEIGHT;

// Reused offscreen layer for the cover mask (notes drawn here, alpha-masked, then
// composited back). The destination-out erase must stay OFF the main canvas —
// applied there it would destroy already-drawn gameplay pixels.
// OffscreenCanvas (not document.createElement) so this path also works inside a worker.
let coverLayer: OffscreenCanvas | null = null;
function getCoverLayer(): { canvas: OffscreenCanvas; ctx: CanvasRenderingContext2D } {
  coverLayer ??= new OffscreenCanvas(LOGICAL_W, LOGICAL_H);
  // OffscreenCanvas's 2D context is structurally compatible with the draw path; one cast
  // (mirrors the Renderer constructor's).
  return { canvas: coverLayer, ctx: coverLayer.getContext('2d') as unknown as CanvasRenderingContext2D };
}

function comboAtTime(comboFrames: readonly { time: number; combo: number }[], timeMs: number): number {
  let lo = 0, hi = comboFrames.length - 1, idx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (comboFrames[mid]!.time <= timeMs) { idx = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return idx >= 0 ? comboFrames[idx]!.combo : 0;
}

function isManiaBreak(breaks: readonly { startTime: number; endTime: number }[], timeMs: number): boolean {
  for (const b of breaks) if (timeMs >= b.startTime && timeMs <= b.endTime) return true;
  return false;
}

interface ManiaCoverSpec {
  /** AlongScroll (true) covers the spawn edge (top); AgainstScroll (false) the hit-line edge (bottom). */
  along: boolean;
  /** Opaque-region height as a fraction of the column (scroll) height. */
  coverage: number;
}

// Resolve the active cover mod (mutually exclusive). HD/FadeIn use combo-driven
// coverage (clamp(160 + combo·0.5, 160, 400)/768, retracting to 0 in breaks);
// Cover (CO) is the static user setting. Reads the render-option toggles (seeded from
// the score's mods, user-flippable); coverage/direction for CO come from the score's
// settings when present, else the lazer defaults baked into modDiff (0.5, AlongScroll).
function resolveManiaCover(session: ManiaSession, timeMs: number, options: RenderOptions): ManiaCoverSpec | null {
  const m = session.modDiff;
  if (options.modCover) {
    return { along: m.coverAlong, coverage: m.coverCoverage };
  }
  if (options.modHidden || options.modFadeIn) {
    if (isManiaBreak(session.beatmap.breaks, timeMs)) return null;
    const combo = comboAtTime(session.comboFrames, timeMs);
    const px = Math.min(COVER_COMBO_MAX_PX, COVER_COMBO_MIN_PX + combo * COVER_COMBO_INCREASE_PER_COMBO);
    return { along: options.modFadeIn, coverage: px / REFERENCE_PLAYFIELD_HEIGHT };
  }
  return null;
}

// Build the destination-out alpha gradient (white = erase note pixels). `h` is the
// scroll-area height (column height); the opaque band is anchored to the spawn edge
// (top, AlongScroll) or hit-line edge (bottom, AgainstScroll), with the fade band
// pointing toward the playfield interior.
function buildCoverGradient(
  ctx: CanvasRenderingContext2D, h: number, spec: ManiaCoverSpec,
): CanvasGradient {
  const c = Math.max(0, Math.min(1, spec.coverage));
  const f = COVER_FADE_FRACTION;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  // addColorStop offsets are fractions of h, measured from the top (y=0).
  const stop = (o: number, a: number) => g.addColorStop(Math.max(0, Math.min(1, o)), `rgba(255,255,255,${a})`);
  if (spec.along) {
    // Opaque from top down to c; fade c → c+f; clear below.
    stop(0, 1); stop(c, 1); stop(c + f, 0); stop(1, 0);
  } else {
    // Clear from top; fade up to (1−c−f) → (1−c); opaque from (1−c) to bottom.
    stop(0, 0); stop(1 - c - f, 0); stop(1 - c, 1); stop(1, 1);
  }
  return g;
}

// Flashlight: full-width horizontal reveal band centred on the playfield's vertical
// midpoint; everything outside the band fades to black. Half-height (osu! px in the
// 768 reference) = 50 · sizeMult · comboScale, ×2.5 in breaks. Combo tiers shrink the
// band (1.0 / 0.8125 / 0.625 at 0 / 100 / 200). A single source-over black gradient
// (transparent in the band → opaque outside) keeps the reveal off-canvas-free.
function drawManiaFlashlight(
  ctx: CanvasRenderingContext2D, layout: ManiaLayout, combo: number, isBreak: boolean, sizeMult: number,
): void {
  const comboScale = combo >= 200 ? 0.625 : combo >= 100 ? 0.8125 : 1;
  const sizePx = FL_DEFAULT_SIZE * sizeMult * (isBreak ? FL_BREAK_MULTIPLIER : comboScale);
  const halfH = sizePx * FL_SCALE;
  const centerY = LOGICAL_H / 2;
  const x = layout.stageLeftX;
  const w = layout.stageRightX - layout.stageLeftX;

  const inner = halfH;
  const outer = halfH * FL_SMOOTHNESS;
  const g = ctx.createLinearGradient(0, 0, 0, LOGICAL_H);
  const at = (y: number, a: number) => g.addColorStop(Math.max(0, Math.min(1, y / LOGICAL_H)), `rgba(0,0,0,${a})`);
  at(0, 1);
  at(centerY - outer, 1);
  at(centerY - inner, 0);
  at(centerY + inner, 0);
  at(centerY + outer, 1);
  at(LOGICAL_H, 1);
  ctx.save();
  ctx.fillStyle = g;
  ctx.fillRect(x, 0, w, LOGICAL_H);
  ctx.restore();
}

/**
 * Render one frame of the mania playfield (stage, bar lines, notes, receptors,
 * lights, popups, mod overlays) at beatmap time `timeMs` onto a 1280×720
 * logical-pixel context. Pure draw call: reads only the immutable session plus
 * the live render options (scroll speed, upscroll, mod toggles).
 */
export function drawManiaPlayfield(
  ctx: CanvasRenderingContext2D,
  session: ManiaSession,
  timeMs: number,
  options: RenderOptions,
): void {
  session = maniaRenderSession(session, options);
  const trackOpacity = resolveTrackOpacity(options, 'mania');
  const showJudgement = options.showJudgement;
  const speed = Math.max(1, Math.min(40, options.maniaScrollSpeed));
  const timeRange = MAX_TIME_RANGE / speed;
  // Upscroll: vertically flip the whole playfield (notes rise from the bottom, hit
  // line at the top). Every legacy skin piece flips on `Up` in osu!, so we mirror
  // the entire scrolling-field draw about the canvas midline with
  // one transform — all the downscroll geometry stays valid, just reflected. The two
  // upright HUD pieces (judgement popups + combo) are drawn outside the flip with their
  // Y mirrored instead, matching lazer's onDirectionChanged (position flips, text doesn't).
  const upscroll = options.maniaUpscroll;

  const { layout, scroll } = session;
  // Cumulative scroll position at the current time — hoisted so every note's
  // position is one subtraction (Sequential algorithm's relRaw(currentTime) term).
  const rNow = scrollRawAt(scroll, timeMs);
  const section = findManiaSection(session.skin, session.totalColumns);

  if (upscroll) {
    ctx.save();
    ctx.translate(0, LOGICAL_H);
    ctx.scale(1, -1);
  }

  // Stage background (per-column Colour{i+1} or flat dark wash).
  ctx.save();
  ctx.globalAlpha *= trackOpacity;
  drawColumnBackground(ctx, layout, section);
  ctx.restore();

  // Column-separator vertical lines (top → hit-target). Drawn AFTER per-column
  // backgrounds and BEFORE notes/keys so the lines sit on the background but
  // can be overlapped by sprites. Lazer's `LegacyStageBackground` adds them
  // alongside the per-column backgrounds within the same container.
  ctx.save();
  ctx.globalAlpha *= trackOpacity;
  drawColumnLines(ctx, layout, section);
  ctx.restore();

  // KeysUnderNotes: when set, receptors render BELOW the falling notes (notes
  // overlap keys at the hit line). Lazer wires this by adding a proxy of the
  // key area into `Column.UnderlayElements`, which puts it under the hit-object
  // content. Default (false) keeps receptors above notes.
  const keysUnderNotes = section?.keysUnderNotes ?? false;
  const heldByCol = computeHeldByColumn(session, timeMs);

  if (keysUnderNotes) {
    drawKeyReceptors(ctx, layout, session.skin, heldByCol);
  }

  const stageWidth = layout.stageRightX - layout.stageLeftX;

  // Bar lines draw uncovered — lazer's cover wraps only each column's
  // HitObjectContainer, not the stage-level bar-line layer.
  ctx.save();
  ctx.beginPath();
  ctx.rect(layout.stageLeftX, 0, stageWidth, layout.hitTargetY);
  ctx.clip();
  ctx.save();
  ctx.globalAlpha *= trackOpacity;
  drawBarLines(ctx, session.barLines, scroll, rNow, timeRange, layout, section);
  ctx.restore();
  ctx.restore();

  // Notes: when a cover mod (HD/FadeIn/CO) is active, render them to an offscreen
  // layer, erase the covered band via destination-out, then composite back so only
  // the notes fade (column backgrounds + bar lines stay visible).
  const cover = resolveManiaCover(session, timeMs, options);
  if (cover) {
    const { canvas: layer, ctx: lctx } = getCoverLayer();
    lctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H);
    lctx.save();
    lctx.beginPath();
    lctx.rect(layout.stageLeftX, 0, stageWidth, layout.hitTargetY);
    lctx.clip();
    drawObjects(lctx, session, rNow, timeMs, timeRange, section);
    lctx.globalCompositeOperation = 'destination-out';
    lctx.fillStyle = buildCoverGradient(lctx, layout.scrollLength, cover);
    lctx.fillRect(layout.stageLeftX, 0, stageWidth, layout.scrollLength);
    lctx.restore();
    ctx.drawImage(layer, 0, 0);
  } else {
    ctx.save();
    ctx.beginPath();
    ctx.rect(layout.stageLeftX, 0, stageWidth, layout.hitTargetY);
    ctx.clip();
    drawObjects(ctx, session, rNow, timeMs, timeRange, section);
    ctx.restore();
  }

  ctx.save();
  ctx.globalAlpha *= trackOpacity;
  drawStageChrome(ctx, layout, session.skin, section);
  ctx.restore();

  // Stage press-light glows up from the hit line (below receptors).
  drawStageLights(ctx, session, timeMs, section);

  if (!keysUnderNotes) {
    drawKeyReceptors(ctx, layout, session.skin, heldByCol);
  }

  ctx.save();
  ctx.globalAlpha *= trackOpacity;
  drawStageBottom(ctx, layout, session.skin);
  ctx.restore();

  // Hold lights (LN held) + hit explosions (per-judgement). Additive overlays
  // drawn above the receptors so the glow visibly sits on top of the keys.
  drawHoldLights(ctx, session, timeMs, section);
  drawHitExplosions(ctx, session, timeMs, section);

  // End of the flipped scrolling field. Popups + combo below draw upright in screen
  // space (with their Y mirrored when upscroll), and the symmetric flashlight band is
  // flip-invariant — all three render after the restore.
  if (upscroll) ctx.restore();

  // Per-stage judgement popup (mania-hit300g/300/200/100/50/0). Gated by the
  // Judgement toggle alongside the combo/score/acc HUD.
  if (showJudgement) drawJudgementPopups(ctx, session, timeMs, section, upscroll);

  // Flashlight: darken the playfield outside the reveal band. Drawn over all
  // playfield elements (notes, chrome, receptors, lights, popups) but under the
  // combo HUD, matching lazer's flashlight-on-DrawableRuleset / HUD-on-top z-order.
  if (options.modFlashlight) {
    const combo = comboAtTime(session.comboFrames, timeMs);
    const isBreak = isManiaBreak(session.beatmap.breaks, timeMs);
    drawManiaFlashlight(ctx, layout, combo, isBreak, 1);
  }

  // Combo counter: centered on stage at ComboPosition (default 111 in 480-space, = 166.5px
  // from top of playfield). Drawn after popups so a fresh combo number overlays a
  // dimming-out judgement piece (matches lazer's Judgements container z-order).
  if (showJudgement) {
    const comboPositionRaw = section?.comboPosition ?? 111;
    const comboBaseY = comboPositionRaw * SKIN_SCALE;
    // Upscroll mirrors the combo's Y (lazer's LegacyManiaComboCounter swaps to a
    // bottom anchor on `Up`); the number itself stays upright.
    const comboCy = upscroll ? LOGICAL_H - comboBaseY : comboBaseY;
    const stageCx = (layout.stageLeftX + layout.stageRightX) / 2;
    drawManiaCombo(ctx, session.comboFrames, timeMs, stageCx, comboCy, session.skin);
  }
}
