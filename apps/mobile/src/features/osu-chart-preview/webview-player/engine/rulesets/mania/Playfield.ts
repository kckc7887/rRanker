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

const LOGICAL_W = 1280;
const LOGICAL_H = 720;

const COLUMN_WIDTH         = 80;
const SPECIAL_COLUMN_WIDTH = 70;

const COLUMN_SPACING       = 0;

const HIT_TARGET_OFFSET_FROM_BOTTOM = 110;
/** LightPosition 从 480 坐标换算，表示距场地下沿的距离。 */

const MAX_TIME_RANGE = 11485;

/** skin.ini 的 480 坐标乘 1.5，映射到 720 高度。 */

const SKIN_SCALE = LOGICAL_H / 480;

/** 素材原生 768 坐标映射到 720，使 receptor 与音符落点对齐。 */

const LAZER_SPRITE_SCALE = LOGICAL_H / 768;

const DEFAULT_COLUMN_LINE_WIDTH = 2;
const DEFAULT_COLUMN_LINE_COLOUR = '#ffffffff';
const DEFAULT_JUDGEMENT_LINE_COLOUR = '#ffffffff';
const JUDGEMENT_LINE_ALPHA = 0.9;
const JUDGEMENT_LINE_HEIGHT = 2;
const COLUMN_LINE_SCALE_X = 0.740;

const BODY_STYLE_STRETCH = 0;

/** 高宽比至少为 4 的 hold 素材按完整长条处理，保留顶部形状。 */

const TALL_BODY_ASPECT = 4;

export interface ManiaColumnLayout {

  x: number;
  width: number;

  textureSuffix: '1' | '2' | 'S';
  isSpecial: boolean;

  noteStem: string;
  headStem: string;
  tailStem: string;
  bodyStem: string;
  keyStem: string;
  keyDownStem: string;
}

export interface ManiaLayout {

  columns: readonly ManiaColumnLayout[];
  stageLeftX: number;
  stageRightX: number;

  hitTargetY: number;

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

function findManiaSection(skin: SkinAssets | undefined, totalColumns: number): ManiaSkinSection | undefined {
  const sections = skin?.config.maniaSections;
  if (sections === undefined) return undefined;
  for (const s of sections) if (s.keys === totalColumns) return s;
  return undefined;
}

export function maniaSkinUpsideDown(skin: SkinAssets | undefined, totalColumns: number): boolean {
  return findManiaSection(skin, totalColumns)?.upsideDown === true;
}

/** 默认拉伸 hold body；只有显式 NoteBodyStyle=2/3/4 时平铺。 */
function bodyStyleIsRepeat(section: ManiaSkinSection | undefined): boolean {
  const explicit = section?.noteBodyStyle;
  return explicit !== undefined && explicit !== BODY_STYLE_STRETCH;
}

/** 素材键统一小写；head/tail 依次回退到对应列的 note。 */
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

  const headStem = explicitHead ?? explicitNote ?? `mania-note${sfx}h`;

  const tailStem = explicitTail ?? explicitHead ?? explicitNote ?? `mania-note${sfx}t`;

  const keyStem     = explicitKey ?? `mania-key${sfx}`;
  const keyDownStem = explicitKD  ?? `mania-key${sfx}d`;

  return { noteStem, headStem, tailStem, bodyStem, keyStem, keyDownStem };
}

export function buildManiaLayout(
  stages: readonly ManiaStage[],
  totalColumns: number,
  skin: SkinAssets | undefined,
): ManiaLayout {
  const section = findManiaSection(skin, totalColumns);

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

  /** 场地居中；ColumnStart 是上游 letterbox 内偏移，不能直接映射屏幕。 */

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

  /** HitPosition 表示距底边距离，与 ScorePosition 的顶部坐标不同。 */

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

const VISIBLE_AHEAD_PX = 250;
const VISIBLE_BEHIND_PX = 300;

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

/** 先去掉路径中的 @2x，再选择高分辨率素材并按半尺寸绘制。 */

function stripAt2x(stem: string): string {
  return stem.replace(/@2x/gi, '');
}

function skinImg(skin: SkinAssets | undefined, stem: string): ImageBitmap | undefined {
  if (skin === undefined || stem === '') return undefined;
  const s = stripAt2x(stem);
  return skin.images.get(`${s}@2x.png`) ?? skin.images.get(`${s}.png`);
}

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

/** 1×1 素材表示明确隐藏，不能当作缺失继续回退。 */
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

  ctx.fillStyle = 'rgb(0, 0, 0)';
  ctx.fillRect(layout.stageLeftX, 0, layout.stageRightX - layout.stageLeftX, LOGICAL_H);

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

  const hintStem = section?.imageLookups['stagehint'] ?? 'mania-stage-hint';
  const hint = skinImg(skin, hintStem);
  if (hint !== undefined && hint.width > 1) {
    const aspect = hint.height / hint.width;
    const h = stageWidth * aspect;
    ctx.drawImage(hint, layout.stageLeftX, layout.hitTargetY - h / 2, stageWidth, h);
  }

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

function drawColumnLines(
  ctx: CanvasRenderingContext2D,
  layout: ManiaLayout,
  section: ManiaSkinSection | undefined,
): void {
  const totalColumns = layout.columns.length;

  const widths = section?.columnLineWidth;
  const colour = section?.colourColumnLine ?? DEFAULT_COLUMN_LINE_COLOUR;
  for (let i = 0; i <= totalColumns; i++) {
    const raw = widths !== undefined ? widths[i] : DEFAULT_COLUMN_LINE_WIDTH;
    if (raw === undefined || raw <= 0) continue;

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
  /** receptor 横向铺满列宽，纵向保持原生比例，并锚定列底部。 */

  const hitAreaH = LOGICAL_H - layout.hitTargetY;
  for (let i = 0; i < layout.columns.length; i++) {
    const col = layout.columns[i]!;
    const isHeld = heldByCol[i] === true;
    const stem = isHeld ? col.keyDownStem : col.keyStem;
    const fallback = isHeld
      ? `mania-key${col.textureSuffix.toLowerCase()}d`
      : `mania-key${col.textureSuffix.toLowerCase()}`;

    let natural: { bitmap: ImageBitmap; pixelScale: number } | null | undefined;
    for (const cand of [stem, fallback, isHeld ? 'mania-key1d' : 'mania-key1']) {
      natural = resolveReceptorSprite(skin, cand);
      if (natural !== undefined) break;
    }
    if (natural != null) {
      const nativeH = natural.bitmap.height * natural.pixelScale * LAZER_SPRITE_SCALE;
      ctx.drawImage(natural.bitmap, col.x, LOGICAL_H - nativeH, col.width, nativeH);
    } else if (natural === undefined) {

      ctx.fillStyle = isHeld ? 'rgba(160, 160, 200, 0.95)' : 'rgba(80, 80, 100, 0.85)';
      ctx.fillRect(col.x, layout.hitTargetY, col.width, hitAreaH);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 1;
      ctx.strokeRect(col.x + 0.5, layout.hitTargetY + 0.5, col.width - 1, hitAreaH - 1);
    }

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

/** note 高度=(noteHeight/素材宽度)×素材高度，未设置时按列宽保留比例。 */
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

  if (spr !== undefined) {
    ctx.drawImage(spr, col.x, yBottom - h, col.width, h);
  } else {
    ctx.fillStyle = 'rgba(220, 230, 255, 0.95)';
    ctx.fillRect(col.x, yBottom - h, col.width, h);
  }
}

const BODY_ANIMATION_FRAME_MS = 30;

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

  const headSpr = resolveStem(skin, col.headStem, `mania-note${col.textureSuffix.toLowerCase()}`)
    ?? skinImg(skin, 'mania-note1');
  /** 缺少 hold body 素材时用 head 素材，避免长条不可见。 */

  const bodySpr = resolveBodySprite(
    skin,
    col.bodyStem,
    `mania-note${col.textureSuffix.toLowerCase()}l`,
    timeMs,
  ) ?? skinImg(skin, 'mania-note1l') ?? headSpr;
  const headH = noteSpriteHeight(col.width, headSpr, widthForNoteHeightScale);

  const explicitTailSpr = col.tailStem !== col.headStem
    ? resolveStem(skin, col.tailStem)
    : undefined;
  const tailSpr = explicitTailSpr ?? headSpr;
  const tailH = noteSpriteHeight(col.width, tailSpr, widthForNoteHeightScale);

  const bodyTopY    = yTail - tailH / 2;
  const bodyBottomY = yHead - headH / 2;
  const bodyH       = bodyBottomY - bodyTopY;
  if (bodyH > 0 && bodySpr !== undefined) {
    if (bodySpr.height >= bodySpr.width * TALL_BODY_ASPECT) {

      const nativeFitH = col.width * (bodySpr.height / bodySpr.width);
      ctx.save();
      ctx.beginPath();
      ctx.rect(col.x, bodyTopY, col.width, bodyH);
      ctx.clip();
      ctx.drawImage(bodySpr, col.x, bodyTopY, col.width, Math.max(nativeFitH, bodyH));
      ctx.restore();
    } else if (bodyRepeats) {

      const tileH = col.width * (bodySpr.height / bodySpr.width);
      if (tileH > 0) {

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

      ctx.drawImage(bodySpr, col.x, bodyTopY, col.width, bodyH);
    }
  }

  /** Down-scroll 下 tail 始终上下翻转，包括显式 tail 素材。 */

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

      if (o.time < minTime) continue;

      const r = session.noteResultByIndex.get(o.sourceIndex);
      if (r !== undefined && r.judgement > 0 && timeMs >= r.time) continue;
      const y = positionYAt(scroll, rNow, o.time, timeRange, layout);
      if (y < -200 || y > layout.hitTargetY + 200) continue;
      drawTapNote(ctx, col, y, session.skin, heightScale);
    } else {

      if (o.endTime < minTime) continue;
      const yTail = positionYAt(scroll, rNow, o.endTime, timeRange, layout);
      if (yTail > layout.hitTargetY + 200) continue;

      const st = holdStates.get(o.sourceIndex);
      const headHit = st !== undefined && st.headJudgement > 0 && st.pressedAt !== null;
      const releasedAt = st?.releasedAt ?? null;

      const completionTime = releasedAt ?? o.endTime;

      /** 已按中的 hold 在松键或结束时消失；head miss 则继续滚动。 */

      if (headHit && timeMs >= completionTime) continue;

      const isCurrentlyHeld = headHit
        && timeMs >= (st!.pressedAt as number)
        && timeMs < completionTime;

      let yHead: number;
      if (isCurrentlyHeld) {
        yHead = layout.hitTargetY;
      } else {
        yHead = positionYAt(scroll, rNow, o.startTime, timeRange, layout);
      }
      /** 有效的延迟松键不让 tail 穿过判定线。 */

      const yTailDraw = isCurrentlyHeld ? Math.min(yTail, layout.hitTargetY) : yTail;

      drawHoldNote(ctx, col, yHead, yTailDraw, session.skin, heightScale, bodyRepeats, timeMs);
    }
  }
}

const POPUP_FADE_IN_MS  = 20;
const POPUP_HOLD_MS     = 160;
const POPUP_FADE_OUT_MS = 40;
const POPUP_TOTAL_MS    = POPUP_FADE_IN_MS + POPUP_HOLD_MS + POPUP_FADE_OUT_MS;

interface PressIntervalLookup { start: number; end: number }

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

function isHeldAt(intervals: readonly PressIntervalLookup[], time: number): boolean {
  const iv = currentOrLastInterval(intervals, time);
  return iv !== null && time >= iv.start && time < iv.end;
}

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

function drawHitExplosions(
  ctx: CanvasRenderingContext2D,
  session: ManiaSession,
  timeMs: number,
  section: ManiaSkinSection | undefined,
): void {

}

function drawHoldLights(
  ctx: CanvasRenderingContext2D,
  session: ManiaSession,
  timeMs: number,
  section: ManiaSkinSection | undefined,
): void {

}

function drawStageLights(
  ctx: CanvasRenderingContext2D,
  session: ManiaSession,
  timeMs: number,
  section: ManiaSkinSection | undefined,
): void {

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

  let scale: number; let rot = 0;
  if (isMiss) {
    const t = Math.min(1, ageMs / 80);
    scale = 1.2 - 0.2 * t;
    rot = 0;
  } else {
    if (ageMs < 40)        scale = 0.8 + 0.2 * (ageMs / 40);
    else if (ageMs < 100)  scale = 1.0 - 0.15 * ((ageMs - 40) / 60);
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
  /** 同一阶段只显示最近一次判定弹窗。 */

  const { hitResults, layout } = session;
  if (hitResults.length === 0) return;

  const minT = timeMs - POPUP_TOTAL_MS;
  let lo = 0, hi = hitResults.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (hitResults[mid]!.time < minT) lo = mid + 1; else hi = mid;
  }

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
  if (frames.length === 0) return;

  const frameLen = frames.length > 1 ? 50 : POPUP_TOTAL_MS;
  const frame = pickFrame(frames, age, frameLen);

  /** ScorePosition 是顶部坐标，乘 SKIN_SCALE；不同于 HitPosition。 */

  const scorePositionPx = (section?.scorePosition ?? 300) * SKIN_SCALE;

  const popupY = upscroll ? LOGICAL_H - scorePositionPx : scorePositionPx;
  const stageCx = (layout.stageLeftX + layout.stageRightX) / 2;

  const prevAlpha = ctx.globalAlpha;
  ctx.globalAlpha = prevAlpha * alpha;

  drawFrameNatural(ctx, frame, stageCx, popupY, scale);
  ctx.globalAlpha = prevAlpha;
}

function computeHeldByColumn(session: ManiaSession, timeMs: number): boolean[] {
  const held = new Array<boolean>(session.totalColumns);
  for (let c = 0; c < session.totalColumns; c++) {
    held[c] = isHeldAt(session.pressIntervals[c] ?? [], timeMs);
  }
  return held;
}

const REFERENCE_PLAYFIELD_HEIGHT = 768;
const COVER_FADE_FRACTION = 0.25;
const COVER_COMBO_MIN_PX = 160;
const COVER_COMBO_MAX_PX = 400;
const COVER_COMBO_INCREASE_PER_COMBO = 0.5;

const FL_DEFAULT_SIZE = 50;
const FL_SMOOTHNESS = 1.1;
const FL_BREAK_MULTIPLIER = 2.5;
const FL_SCALE = LOGICAL_H / REFERENCE_PLAYFIELD_HEIGHT;

/** destination-out 只作用于离屏音符层，避免擦除背景。 */

let coverLayer: OffscreenCanvas | null = null;
function getCoverLayer(): { canvas: OffscreenCanvas; ctx: CanvasRenderingContext2D } {
  coverLayer ??= new OffscreenCanvas(LOGICAL_W, LOGICAL_H);

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

  along: boolean;

  coverage: number;
}

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

function buildCoverGradient(
  ctx: CanvasRenderingContext2D, h: number, spec: ManiaCoverSpec,
): CanvasGradient {
  const c = Math.max(0, Math.min(1, spec.coverage));
  const f = COVER_FADE_FRACTION;
  const g = ctx.createLinearGradient(0, 0, 0, h);

  const stop = (o: number, a: number) => g.addColorStop(Math.max(0, Math.min(1, o)), `rgba(255,255,255,${a})`);
  if (spec.along) {

    stop(0, 1); stop(c, 1); stop(c + f, 0); stop(1, 0);
  } else {

    stop(0, 0); stop(1 - c - f, 0); stop(1 - c, 1); stop(1, 1);
  }
  return g;
}

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
  /** Upscroll 翻转游戏层；HUD 仅翻转位置，文字保持正立。 */

  const upscroll = options.maniaUpscroll;

  const { layout, scroll } = session;

  const rNow = scrollRawAt(scroll, timeMs);
  const section = findManiaSection(session.skin, session.totalColumns);

  if (upscroll) {
    ctx.save();
    ctx.translate(0, LOGICAL_H);
    ctx.scale(1, -1);
  }

  ctx.save();
  ctx.globalAlpha *= trackOpacity;
  drawColumnBackground(ctx, layout, section);
  ctx.restore();

  ctx.save();
  ctx.globalAlpha *= trackOpacity;
  drawColumnLines(ctx, layout, section);
  ctx.restore();

  const keysUnderNotes = section?.keysUnderNotes ?? false;
  const heldByCol = computeHeldByColumn(session, timeMs);

  if (keysUnderNotes) {
    drawKeyReceptors(ctx, layout, session.skin, heldByCol);
  }

  const stageWidth = layout.stageRightX - layout.stageLeftX;

  /** cover 仅覆盖音符，节拍线保持可见。 */

  ctx.save();
  ctx.beginPath();
  ctx.rect(layout.stageLeftX, 0, stageWidth, layout.hitTargetY);
  ctx.clip();
  ctx.save();
  ctx.globalAlpha *= trackOpacity;
  drawBarLines(ctx, session.barLines, scroll, rNow, timeRange, layout, section);
  ctx.restore();
  ctx.restore();

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

  drawStageLights(ctx, session, timeMs, section);

  if (!keysUnderNotes) {
    drawKeyReceptors(ctx, layout, session.skin, heldByCol);
  }

  ctx.save();
  ctx.globalAlpha *= trackOpacity;
  drawStageBottom(ctx, layout, session.skin);
  ctx.restore();

  drawHoldLights(ctx, session, timeMs, section);
  drawHitExplosions(ctx, session, timeMs, section);

  if (upscroll) ctx.restore();

  if (showJudgement) drawJudgementPopups(ctx, session, timeMs, section, upscroll);

  if (options.modFlashlight) {
    const combo = comboAtTime(session.comboFrames, timeMs);
    const isBreak = isManiaBreak(session.beatmap.breaks, timeMs);
    drawManiaFlashlight(ctx, layout, combo, isBreak, 1);
  }

  if (showJudgement) {
    const comboPositionRaw = section?.comboPosition ?? 111;
    const comboBaseY = comboPositionRaw * SKIN_SCALE;

    const comboCy = upscroll ? LOGICAL_H - comboBaseY : comboBaseY;
    const stageCx = (layout.stageLeftX + layout.stageRightX) / 2;
    drawManiaCombo(ctx, session.comboFrames, timeMs, stageCx, comboCy, session.skin);
  }
}
