/**
 * TOUCH / TOUCH HOLD 花瓣贴图与时长对照 MajdataViewX（GPL-3.0）。
 * 公式见 arcadeMotion.ts；未复制 C# 或 HLSL。烟花仍为既有矢量实现。
 */
import { BaseRenderer } from "./BaseRenderer";
import { TouchNote, TouchHoldStartNote, Point2D, TouchPosition } from "../types";
import {
  TOUCH_SENSOR_RADII,
  TOUCH_PETAL_CLOSED_RATIO,
  NOTE_STROKE_WIDTH_RATIO,
  COLORS,
  BASE_ANGLE,
  BUTTON_ANGLE_OFFSET,
  BUTTON_ANGLE_STEP,
} from "../utils/constants";
import { fireworkCoveragePeakRadius } from "./fireworkLayout";
import { arcadeTouchPose, canvasDistanceFromArcade } from "../utils/arcadeMotion";
import { drawSkinSprite, touchBorderSkinPath, touchPointSkinPath, touchSkinPath } from "./skinAtlas";

const FIREWORK_DURATION_MS = 1333;
// 星爆最大可见半径：baseRadius(radius/4.5) × scale 峰值 5.0，留 5% 边距。
const FIREWORK_EXTENT_RATIO = (5.0 / 4.5) * 1.05;
const FIREWORK_EXTENT_MARGIN = 1.05;
const FIREWORK_SCALE_PEAK = 5.0;
// scale 低于此值走矢量绘制（成本 ∝ 面积），达到后切精灵（缩小率 ≤2:1 无极端采样）。
const FIREWORK_SPRITE_MIN_SCALE = 2.5;
const FIREWORK_HOLE_START_SEC = 0.6;
const FIREWORK_END_SEC = 1.1;

// 烟花触发时刻
export function fireworkTriggerMs(note: TouchNote | TouchHoldStartNote): number {
  return note.type === "touch-hold-start" ? note.timingMs + note.durationMs : note.timingMs;
}

// 15 片 pastel wedge，颜色循环。
const FIREWORK_PETAL_COLORS = [
  "#FFB3BA",
  "#FFD0A8",
  "#FFFAB8",
  "#D8F0A8",
  "#B8E0B0",
  "#A8E0CC",
  "#A8C8E8",
  "#B8B0E8",
  "#D0B0E8",
  "#F0B0D8",
  "#FFC9A8",
  "#FFEFA8",
  "#C8E8A8",
  "#A8E0BC",
  "#A8CCE8",
];

export class TouchRenderer extends BaseRenderer {
  // 楔形星爆几何自相似：峰值尺寸下烘焙一张全分辨率无旋转精灵，成长期按比例缩放绘制即精确。
  private fireworkWedgeSprite: HTMLCanvasElement | null = null;
  // canvas 源 drawImage 可能每帧重传纹理；ImageBitmap 不可变、GPU 常驻，就绪后优先使用。
  private fireworkWedgeBitmap: ImageBitmap | null = null;
  private fireworkSpriteBasis = "";
  // 消散期在烟花大小的小画布上应用 destination-out 掩膜，避免擦除主画布其他内容。
  private fireworkScratch: HTMLCanvasElement | null = null;
  private fireworkScratchCtx: CanvasRenderingContext2D | null = null;
  // touch 花瓣精灵缓存，key = 层|变体|花瓣索引。
  private touchPetalSprites = new Map<string, HTMLCanvasElement>();
  private touchSpriteBasis = "";

  /** canvas backing store 相对逻辑坐标的缩放（含 DPR），精灵按它烘焙保持原生分辨率。 */
  private getBackingScale(): number {
    return this.context.canvas.width / (this.context.centerX * 2);
  }

  private getWedgeSprite(): HTMLCanvasElement {
    const backingScale = this.getBackingScale();
    const basis = `${this.context.radius}|${backingScale}`;
    if (this.fireworkWedgeSprite && this.fireworkSpriteBasis === basis) {
      return this.fireworkWedgeSprite;
    }

    const half = this.context.radius * FIREWORK_EXTENT_RATIO;
    const sizePx = Math.max(2, Math.ceil(half * 2 * backingScale));
    const sprite = document.createElement("canvas");
    sprite.width = sizePx;
    sprite.height = sizePx;
    const spriteCtx = sprite.getContext("2d")!;
    spriteCtx.setTransform(backingScale, 0, 0, backingScale, sizePx / 2, sizePx / 2);

    const outerR = (this.context.radius / 4.5) * FIREWORK_SCALE_PEAK;
    // 消失改由掩膜处理，alpha 全程保持 plateau。
    spriteCtx.globalAlpha = 0.589;

    // 三角形 wedge 从中心辐射，wedge 角宽 < 间隙；边缘 10% radial fade 避免硬切。
    const N = FIREWORK_PETAL_COLORS.length;
    const halfWidth = (Math.PI / N) * 0.45;
    const FADE_INNER = 0.9;
    for (let i = 0; i < N; i++) {
      const angle = (i / N) * Math.PI * 2;
      const path = new Path2D();
      path.moveTo(0, 0);
      path.lineTo(Math.cos(angle - halfWidth) * outerR, Math.sin(angle - halfWidth) * outerR);
      path.lineTo(Math.cos(angle + halfWidth) * outerR, Math.sin(angle + halfWidth) * outerR);
      path.closePath();

      const color = FIREWORK_PETAL_COLORS[i];
      const grad = spriteCtx.createRadialGradient(0, 0, 0, 0, 0, outerR);
      grad.addColorStop(0, color);
      grad.addColorStop(FADE_INNER, color);
      grad.addColorStop(1, color + "00"); // 8-hex 形式给 alpha=0
      spriteCtx.fillStyle = grad;
      spriteCtx.fill(path);
    }

    this.fireworkWedgeSprite = sprite;
    this.fireworkSpriteBasis = basis;
    this.fireworkWedgeBitmap?.close();
    this.fireworkWedgeBitmap = null;
    // 位图不可用或创建失败时保持 null，getWedgeImage 回退 canvas 精灵。
    if (typeof createImageBitmap === "function") {
      createImageBitmap(sprite)
        .then((bitmap) => {
          if (this.fireworkSpriteBasis !== basis || this.fireworkWedgeSprite !== sprite) {
            bitmap.close();
            return;
          }
          this.fireworkWedgeBitmap = bitmap;
          // 位图纹理首次合成时才真正上传；在与真实渲染一致的圆形 clip 内以全尺寸+半尺寸各画一次消化掉。
          const ctx = this.context.ctx;
          const size = this.context.radius * FIREWORK_EXTENT_RATIO * 2;
          ctx.save();
          ctx.beginPath();
          ctx.arc(this.context.centerX, this.context.centerY, this.context.centerX, 0, Math.PI * 2);
          ctx.clip();
          ctx.globalAlpha = 1 / 255;
          ctx.translate(this.context.centerX, this.context.centerY);
          ctx.rotate(0.1);
          ctx.drawImage(bitmap, -size / 2, -size / 2, size, size);
          ctx.drawImage(bitmap, -size / 4, -size / 4, size / 2, size / 2);
          ctx.restore();
        })
        .catch(() => {});
    }
    return sprite;
  }

  private getWedgeImage(): HTMLCanvasElement | ImageBitmap {
    const sprite = this.getWedgeSprite();
    return this.fireworkWedgeBitmap ?? sprite;
  }

  // 与 getWedgeSprite 同几何/配色的实时矢量版，供小 scale 成长期使用。
  private drawWedgesVector(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    scale: number,
    rotation: number,
  ): void {
    const outerR = (this.context.radius / 4.5) * scale;
    if (outerR <= 0) return;
    ctx.save();
    ctx.globalAlpha = 0.589;
    const N = FIREWORK_PETAL_COLORS.length;
    const halfWidth = (Math.PI / N) * 0.45;
    const FADE_INNER = 0.9;
    for (let i = 0; i < N; i++) {
      const angle = (i / N) * Math.PI * 2 + rotation;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(
        x + Math.cos(angle - halfWidth) * outerR,
        y + Math.sin(angle - halfWidth) * outerR,
      );
      ctx.lineTo(
        x + Math.cos(angle + halfWidth) * outerR,
        y + Math.sin(angle + halfWidth) * outerR,
      );
      ctx.closePath();
      const color = FIREWORK_PETAL_COLORS[i];
      const grad = ctx.createRadialGradient(x, y, 0, x, y, outerR);
      grad.addColorStop(0, color);
      grad.addColorStop(FADE_INNER, color);
      grad.addColorStop(1, color + "00"); // 8-hex 形式给 alpha=0
      ctx.fillStyle = grad;
      ctx.fill();
    }
    ctx.restore();
  }

  /** 预热精灵与 scratch：烘焙、光栅化并上传纹理，避免首个烟花触发帧掉帧。 */
  warmFireworkResources(): void {
    const backingScale = this.getBackingScale();
    // 布局未就绪（centerX=0）时 backingScale 为 NaN/Infinity，烘出的精灵尺寸归零，
    // iOS WebKit 的 drawImage 会抛 InvalidStateError 中断整帧渲染；推迟到布局完成后预热。
    if (!Number.isFinite(backingScale) || backingScale <= 0) return;
    const basis = `${this.context.radius}|${backingScale}`;
    if (this.fireworkSpriteBasis === basis && this.fireworkScratch) return;
    const sprite = this.getWedgeSprite();
    const half = this.context.radius * FIREWORK_EXTENT_RATIO;
    const sizePx = Math.max(2, Math.ceil(half * 2 * backingScale));
    const scratch = this.acquireFireworkScratch(sizePx);
    scratch.drawImage(sprite, 0, 0);
    // scratch 侧同样预热消散期用的 destination-out 三停渐变管线。
    scratch.globalCompositeOperation = "destination-out";
    const scratchGrad = scratch.createRadialGradient(0, 0, 0, 0, 0, 1);
    scratchGrad.addColorStop(0, "rgba(0,0,0,1)");
    scratchGrad.addColorStop(0.5, "rgba(0,0,0,1)");
    scratchGrad.addColorStop(1, "rgba(0,0,0,0)");
    scratch.fillStyle = scratchGrad;
    scratch.fillRect(0, 0, 2, 2);
    scratch.globalCompositeOperation = "source-over";
    // 主画布在与真实渲染一致的圆形 clip 内逐一走真实绘制管线，亚像素缩放+低 alpha 不可见。
    const ctx = this.context.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.arc(this.context.centerX, this.context.centerY, this.context.centerX, 0, Math.PI * 2);
    ctx.clip();
    ctx.globalAlpha = 1 / 255;
    ctx.translate(this.context.centerX, this.context.centerY);
    ctx.rotate(0.1);
    ctx.drawImage(sprite, -half, -half, half * 2, half * 2);
    ctx.drawImage(this.fireworkScratch!, -half, -half, half * 2, half * 2);
    ctx.rotate(-0.1);
    ctx.scale(0.01, 0.01);
    this.drawWedgesVector(ctx, 0, 0, 1, 0.1);
    this.drawFireworkBalls(ctx, 0, 0, 0.3);
    ctx.restore();
  }

  private acquireFireworkScratch(sizePx: number): CanvasRenderingContext2D {
    if (!this.fireworkScratch || this.fireworkScratch.width !== sizePx) {
      this.fireworkScratch = document.createElement("canvas");
      this.fireworkScratch.width = sizePx;
      this.fireworkScratch.height = sizePx;
      this.fireworkScratchCtx = this.fireworkScratch.getContext("2d");
    }
    const ctx = this.fireworkScratchCtx!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, sizePx, sizePx);
    return ctx;
  }

  // 中心两层闪光，'lighter' 加法混合让重叠中心更亮。
  private drawFireworkBalls(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    growT: number,
  ): void {
    if (growT < 0) return;
    const baseRadius = this.context.radius / 4.5;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    // ---- ColorBallBig（外圈光晕）：peak 0.7 留 headroom，避免与小球叠加后硬切。
    const BIG_GROW = 0.06;
    const BIG_RISE = 0.04;
    const bigRMax = baseRadius * 1.3;
    const BIG_DECAY_END = FIREWORK_DURATION_MS / 1000 - 0.1;
    const BIG_PEAK_ALPHA = 0.7;
    let bigAlpha = 0;
    let bigR = 0;
    if (growT < BIG_GROW) {
      bigR = (growT / BIG_GROW) * bigRMax;
      bigAlpha = BIG_PEAK_ALPHA * Math.min(1, growT / BIG_RISE);
    } else {
      const d = (growT - BIG_GROW) / (BIG_DECAY_END - BIG_GROW);
      bigR = bigRMax * (1 - d);
      bigAlpha = BIG_PEAK_ALPHA * (1 - d);
    }
    if (bigAlpha > 0 && bigR > 0) {
      ctx.globalAlpha = bigAlpha;
      const grad = ctx.createRadialGradient(x, y, 0, x, y, bigR);
      grad.addColorStop(0, "rgb(255, 235, 200)");
      grad.addColorStop(1, "rgba(255, 180, 100, 0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, bigR, 0, Math.PI * 2);
      ctx.fill();
    }

    // ---- ColorBall（内核高光）：peak 0.6，与外圈叠加得到纯白中心 + 平滑 falloff。
    const SMALL_GROW = 0.04;
    const SMALL_RISE = 0.02;
    const smallRMax = baseRadius * 0.55;
    const SMALL_DECAY_END = 0.55;
    const SMALL_PEAK_ALPHA = 0.6;
    let smallAlpha = 0;
    let smallR = 0;
    if (growT < SMALL_GROW) {
      smallR = (growT / SMALL_GROW) * smallRMax;
      smallAlpha = SMALL_PEAK_ALPHA * Math.min(1, growT / SMALL_RISE);
    } else if (growT < SMALL_DECAY_END) {
      const d = (growT - SMALL_GROW) / (SMALL_DECAY_END - SMALL_GROW);
      smallR = smallRMax * (1 - d);
      smallAlpha = SMALL_PEAK_ALPHA * (1 - d);
    }
    if (smallAlpha > 0 && smallR > 0) {
      ctx.globalAlpha = smallAlpha;
      const grad = ctx.createRadialGradient(x, y, 0, x, y, smallR);
      grad.addColorStop(0, "rgb(255, 245, 220)");
      grad.addColorStop(1, "rgba(255, 220, 160, 0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, smallR, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  /** 花瓣精灵半宽（逻辑单位）：花瓣尺寸 + 描边 + 阴影余量。 */
  private getTouchSpriteHalf(): number {
    return (
      this.scaleByRadius(TOUCH_PETAL_CLOSED_RATIO) * 1.3 +
      this.scaleByRadius(NOTE_STROKE_WIDTH_RATIO) * 3 +
      this.scaleByRadius(8 / 300) +
      this.scaleByRadius(2 / 300)
    );
  }

  /** 花瓣按 (层|变体|花瓣索引) 烘焙，连续定位绘制；sb=阴影+黑宽边、f=填充、w=白描边。 */
  private getTouchPetalSprite(
    layer: "sb" | "f" | "w",
    kind: "n" | "s" | "h",
    i: number,
  ): HTMLCanvasElement {
    const backingScale = this.getBackingScale();
    const basis = `${this.context.radius}|${backingScale}`;
    if (this.touchSpriteBasis !== basis) {
      this.touchPetalSprites.clear();
      this.touchSpriteBasis = basis;
    }
    // sb/w 层与颜色无关，simultaneous 与 normal 共用几何。
    const geomKind = layer === "f" ? kind : kind === "h" ? "h" : "n";
    const key = `${layer}|${geomKind}|${i}`;
    let sprite = this.touchPetalSprites.get(key);
    if (sprite) return sprite;

    const half = this.getTouchSpriteHalf();
    const sizePx = Math.max(2, Math.ceil(half * 2 * backingScale));
    sprite = document.createElement("canvas");
    sprite.width = sizePx;
    sprite.height = sizePx;
    const sctx = sprite.getContext("2d")!;
    sctx.setTransform(backingScale, 0, 0, backingScale, sizePx / 2, sizePx / 2);

    const isHold = geomKind === "h";
    const petalBaseAngles = [-Math.PI / 4, Math.PI / 4, (3 * Math.PI) / 4, (-3 * Math.PI) / 4];
    const petalAngle = petalBaseAngles[i] + (isHold ? 0 : -Math.PI / 4);
    const petalSize = this.scaleByRadius(TOUCH_PETAL_CLOSED_RATIO) * 1.3;
    const tipAngle = petalAngle + Math.PI;
    const leftAngle = petalAngle + Math.PI / 2;
    const rightAngle = petalAngle - Math.PI / 2;
    const tipX = Math.cos(tipAngle) * petalSize;
    const tipY = Math.sin(tipAngle) * petalSize;
    const leftX = Math.cos(leftAngle) * petalSize;
    const leftY = Math.sin(leftAngle) * petalSize;
    const rightX = Math.cos(rightAngle) * petalSize;
    const rightY = Math.sin(rightAngle) * petalSize;
    const innerRatio = 0.4;
    const cx = (tipX + leftX + rightX) / 3;
    const cy = (tipY + leftY + rightY) / 3;
    const innerTipX = cx + (tipX - cx) * innerRatio;
    const innerTipY = cy + (tipY - cy) * innerRatio;
    const innerLeftX = cx + (leftX - cx) * innerRatio;
    const innerLeftY = cy + (leftY - cy) * innerRatio;
    const innerRightX = cx + (rightX - cx) * innerRatio;
    const innerRightY = cy + (rightY - cy) * innerRatio;
    const cornerRadius = this.scaleByRadius(8 / 300);
    const innerCornerRadius = cornerRadius * 0.4;
    const strokeWidth = this.scaleByRadius(NOTE_STROKE_WIDTH_RATIO);
    const petalColors = [
      COLORS.TOUCH_HOLD_RED,
      COLORS.TOUCH_HOLD_YELLOW,
      COLORS.TOUCH_HOLD_GREEN,
      COLORS.TOUCH_HOLD_BLUE,
    ];

    const mainCtx = this.context.ctx;
    this.context.ctx = sctx;
    try {
      if (layer === "sb") {
        sctx.shadowColor = "rgba(0, 0, 0, 0.5)";
        sctx.shadowBlur = this.scaleByRadius(8 / 300);
        sctx.shadowOffsetX = this.scaleByRadius(2 / 300);
        sctx.shadowOffsetY = this.scaleByRadius(2 / 300);
        sctx.fillStyle = "rgba(0, 0, 0, 0.01)"; // 透明填充，只为阴影
        sctx.beginPath();
        this.drawRoundedTriangle(tipX, tipY, leftX, leftY, rightX, rightY, cornerRadius);
        sctx.fill();
        sctx.shadowColor = "transparent";
        sctx.shadowBlur = 0;
        sctx.shadowOffsetX = 0;
        sctx.shadowOffsetY = 0;
        sctx.beginPath();
        this.drawRoundedTriangle(tipX, tipY, leftX, leftY, rightX, rightY, cornerRadius);
        this.stroke(COLORS.BLACK, strokeWidth * 3);
        if (!isHold) {
          sctx.beginPath();
          this.drawRoundedTriangle(
            innerTipX,
            innerTipY,
            innerLeftX,
            innerLeftY,
            innerRightX,
            innerRightY,
            innerCornerRadius,
          );
          this.stroke(COLORS.BLACK, strokeWidth * 3);
        }
      } else if (layer === "f") {
        let fillStyle: string | CanvasGradient;
        if (kind === "h") {
          fillStyle = petalColors[i];
        } else {
          const gradient = sctx.createLinearGradient(0, 0, tipX, tipY);
          gradient.addColorStop(0, kind === "s" ? "#FFFF00" : "#00FFFF");
          gradient.addColorStop(1, kind === "s" ? "#FFD700" : "#0080FF");
          fillStyle = gradient;
        }
        sctx.beginPath();
        this.drawRoundedTriangle(tipX, tipY, leftX, leftY, rightX, rightY, cornerRadius);
        if (!isHold) {
          this.drawRoundedTriangle(
            innerTipX,
            innerTipY,
            innerRightX,
            innerRightY,
            innerLeftX,
            innerLeftY,
            innerCornerRadius,
          );
        }
        sctx.fillStyle = fillStyle;
        sctx.fill();
      } else {
        sctx.beginPath();
        this.drawRoundedTriangle(tipX, tipY, leftX, leftY, rightX, rightY, cornerRadius);
        if (!isHold) {
          this.drawRoundedTriangle(
            innerTipX,
            innerTipY,
            innerLeftX,
            innerLeftY,
            innerRightX,
            innerRightY,
            innerCornerRadius,
          );
        }
        this.stroke(COLORS.WHITE, strokeWidth);
      }
    } finally {
      this.context.ctx = mainCtx;
    }
    this.touchPetalSprites.set(key, sprite);
    return sprite;
  }

  getTouchPosition(touchPosition: TouchPosition): Point2D {
    const mirroredPosition = this.mirrorTouchPosition(touchPosition);
    const region = mirroredPosition[0];
    const sensorNum = mirroredPosition.length > 1 ? parseInt(mirroredPosition[1]) : 0;

    const radiusRatio = TOUCH_SENSOR_RADII[region] || 0;
    const distance = this.context.radius * radiusRatio;

    if (region === "C") {
      return { x: this.context.centerX, y: this.context.centerY };
    }

    // D/E 与按钮对齐；A/B 偏移半个按钮。
    const angle =
      region === "D" || region === "E"
        ? BASE_ANGLE + (sensorNum - 1) * BUTTON_ANGLE_STEP
        : BASE_ANGLE + BUTTON_ANGLE_OFFSET + (sensorNum - 1) * BUTTON_ANGLE_STEP;

    return {
      x: this.context.centerX + Math.cos(angle) * distance,
      y: this.context.centerY + Math.sin(angle) * distance,
    };
  }

  renderTouch(
    note: TouchNote | TouchHoldStartNote,
    _currentBeat: number,
    currentTimeMs: number,
    isSimultaneous: boolean,
  ): void {
    const isHold = note.type === "touch-hold-start";
    const timeDiff = note.timingMs - currentTimeMs;
    const holdMs = isHold && "durationMs" in note ? note.durationMs : 0;
    const holdActive = isHold && timeDiff <= 0 && timeDiff > -holdMs;
    const pose = arcadeTouchPose(timeDiff, this.getNoteTouchSpeed(note));
    if (!pose.visible && !holdActive) return;

    const position = this.getTouchPosition(note.position);
    const isBreak = false;
    const skin = this.context.skin;
    const petal = skin?.get(isHold
      ? `TouchHoldSkins/touchhold_${isBreak ? 'break_' : ''}${0}.png`
      : touchSkinPath(isBreak, isSimultaneous));
    const point = skin?.get(touchPointSkinPath(isBreak, isSimultaneous));
    const fanDist = holdActive ? 0.4 : pose.fanDist;
    const alpha = holdActive ? 1 : pose.fanAlpha;
    const offset = canvasDistanceFromArcade(0.226 + fanDist, this.context.radius);
    const petalAngles = isHold
      ? [Math.PI / 4, (3 * Math.PI) / 4, (-3 * Math.PI) / 4, -Math.PI / 4]
      : [0, Math.PI / 2, Math.PI, -Math.PI / 2];

    if (holdActive && holdMs > 0) {
      this.drawTouchHoldMask(position.x, position.y, offset * 2, 1 - (-timeDiff) / holdMs);
    }
    if (petal) {
      for (let i = 0; i < 4; i++) {
        const holdPetal = isHold
          ? skin?.get(`TouchHoldSkins/touchhold_${isBreak ? 'break_' : ''}${i}.png`) ?? petal
          : petal;
        const angle = petalAngles[i];
        drawSkinSprite(this.context.ctx, holdPetal, position.x + Math.cos(angle) * offset, position.y + Math.sin(angle) * offset, this.context.radius, {
          rotation: angle + Math.PI / 2,
          alpha,
        });
      }
    }
    if (point) {
      drawSkinSprite(this.context.ctx, point, position.x, position.y, this.context.radius, { alpha });
    }
  }

  private drawTouchHoldMask(x: number, y: number, size: number, cutoff: number): void {
    const ctx = this.context.ctx;
    const border = this.context.skin?.get('TouchHoldSkins/touchhold_border.png');
    if (border) {
      drawSkinSprite(ctx, border, x, y, this.context.radius);
    }
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, size * 0.45, -Math.PI / 2, -Math.PI / 2 + cutoff * Math.PI * 2, false);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = Math.max(2, size * 0.06);
    ctx.stroke();
    ctx.restore();
  }


  renderTouchFireworks(
    touches: readonly (TouchNote | TouchHoldStartNote)[],
    currentTimeMs: number,
  ): void {
    let lo = 0;
    let hi = touches.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (fireworkTriggerMs(touches[mid]) <= currentTimeMs) lo = mid + 1;
      else hi = mid;
    }
    const latestNote = lo > 0 ? touches[lo - 1] : null;
    if (!latestNote) return;
    const ageMs = currentTimeMs - fireworkTriggerMs(latestNote);
    if (ageMs >= FIREWORK_DURATION_MS) return;
    const tSec = ageMs / 1000;
    if (tSec >= FIREWORK_END_SEC) return;

    // scale: cubic ease-out 0→peak（t=0.1→0.5），之后维持到 mask 擦完。
    let scale: number;
    if (tSec < 0.1) scale = 0;
    else if (tSec < 0.5) {
      const u = (tSec - 0.1) / 0.4;
      scale = (1 - Math.pow(1 - u, 3)) * FIREWORK_SCALE_PEAK;
    } else scale = FIREWORK_SCALE_PEAK;

    const position = this.getTouchPosition(latestNote.position);
    const rotation = (ageMs / FIREWORK_DURATION_MS) * ((72 * Math.PI) / 180);
    const ctx = this.context.ctx;
    const centeredPeakRadius = (this.context.radius / 4.5) * FIREWORK_SCALE_PEAK;
    const peakRadius = fireworkCoveragePeakRadius(
      this.context.radius,
      this.context.centerX,
      this.context.centerY,
      position.x,
      position.y,
    );
    const coverageMultiplier = peakRadius / centeredPeakRadius;
    const effectScale = scale * coverageMultiplier;
    const half = peakRadius * FIREWORK_EXTENT_MARGIN;

    if (tSec <= FIREWORK_HOLE_START_SEC) {
      // 成长期无掩膜：小 scale 走矢量，达阈值切精灵。
      if (effectScale > 0 && effectScale < FIREWORK_SPRITE_MIN_SCALE) {
        this.drawWedgesVector(ctx, position.x, position.y, effectScale, rotation);
      } else if (effectScale > 0) {
        const drawHalf = half * (scale / FIREWORK_SCALE_PEAK);
        ctx.save();
        ctx.translate(position.x, position.y);
        ctx.rotate(rotation);
        ctx.drawImage(this.getWedgeImage(), -drawHalf, -drawHalf, drawHalf * 2, drawHalf * 2);
        ctx.restore();
      }
      this.drawFireworkBalls(ctx, position.x, position.y, tSec - 0.1);
      return;
    }

    // 消散期：scratch 上合成精灵+闪光，destination-out 擦洞后整体贴回主画布。
    const backingScale = this.getBackingScale();
    const sizePx = Math.max(2, Math.ceil(half * 2 * backingScale));
    const scratch = this.acquireFireworkScratch(sizePx);
    scratch.setTransform(backingScale, 0, 0, backingScale, sizePx / 2, sizePx / 2);
    scratch.rotate(rotation);
    scratch.drawImage(this.getWedgeImage(), -half, -half, half * 2, half * 2);
    scratch.rotate(-rotation);
    this.drawFireworkBalls(scratch, 0, 0, tSec - 0.1);

    // 掩膜 = 实心核心 + 羽化边缘，从中心扩张擦除。
    const outerR = (this.context.radius / 4.5) * effectScale;
    const holeSpan = FIREWORK_END_SEC - FIREWORK_HOLE_START_SEC;
    const linearU = Math.min(1, (tSec - FIREWORK_HOLE_START_SEC) / holeSpan);
    // alpha 前 20% 快速升到 1 让实心 mask 早早可见；尺寸 smoothstep 起停柔和。
    const u = linearU * linearU * (3 - 2 * linearU);
    const solidR = outerR * (0.05 + u * 0.95);
    const totalR = solidR + outerR * 0.5;
    const maskAlpha = Math.min(1, linearU / 0.2);
    if (totalR > 0 && maskAlpha > 0) {
      scratch.globalCompositeOperation = "destination-out";
      scratch.globalAlpha = maskAlpha;
      const maskGrad = scratch.createRadialGradient(0, 0, 0, 0, 0, totalR);
      maskGrad.addColorStop(0, "rgba(0,0,0,1)");
      maskGrad.addColorStop(solidR / totalR, "rgba(0,0,0,1)");
      maskGrad.addColorStop(1, "rgba(0,0,0,0)");
      scratch.fillStyle = maskGrad;
      scratch.beginPath();
      scratch.arc(0, 0, totalR, 0, Math.PI * 2);
      scratch.fill();
      scratch.globalCompositeOperation = "source-over";
      scratch.globalAlpha = 1;
    }

    ctx.drawImage(this.fireworkScratch!, position.x - half, position.y - half, half * 2, half * 2);
  }

  /** 同位置多 touch 时围一圈带 gap 的圆角框。 */
  renderTouchBorder(position: Point2D, isSimultaneous: boolean, visibleTouchCount: number): void {
    const path = touchBorderSkinPath(visibleTouchCount, false, isSimultaneous);
    const image = path ? this.context.skin?.get(path) : undefined;
    if (!image) return;
    drawSkinSprite(this.context.ctx, image, position.x, position.y, this.context.radius);
  }

  private drawTouchBorderBox(
    x: number,
    y: number,
    size: number,
    cornerRadius: number,
    color: string,
    lineWidth: number,
  ): void {
    const half = size / 2;
    const left = x - half;
    const top = y - half;
    const gap = size * 0.3;
    const ctx = this.context.ctx;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = (lineWidth * this.context.radius) / 300;
    ctx.beginPath();

    // 圆角方框，每条边中点被 gap 切开 → 8 段（每边两半 + 4 个圆角）。
    ctx.moveTo(left + cornerRadius, top);
    ctx.lineTo(left + size / 2 - gap / 2, top);
    ctx.moveTo(left + size / 2 + gap / 2, top);
    ctx.lineTo(left + size - cornerRadius, top);
    ctx.arcTo(left + size, top, left + size, top + cornerRadius, cornerRadius);

    ctx.lineTo(left + size, top + size / 2 - gap / 2);
    ctx.moveTo(left + size, top + size / 2 + gap / 2);
    ctx.lineTo(left + size, top + size - cornerRadius);
    ctx.arcTo(left + size, top + size, left + size - cornerRadius, top + size, cornerRadius);

    ctx.lineTo(left + size / 2 + gap / 2, top + size);
    ctx.moveTo(left + size / 2 - gap / 2, top + size);
    ctx.lineTo(left + cornerRadius, top + size);
    ctx.arcTo(left, top + size, left, top + size - cornerRadius, cornerRadius);

    ctx.lineTo(left, top + size / 2 + gap / 2);
    ctx.moveTo(left, top + size / 2 - gap / 2);
    ctx.lineTo(left, top + cornerRadius);
    ctx.arcTo(left, top, left + cornerRadius, top, cornerRadius);

    ctx.stroke();
    ctx.restore();
  }

  private drawRoundedTriangle(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    x3: number,
    y3: number,
    cornerRadius: number,
  ): void {
    if (cornerRadius <= 0) {
      const ctx = this.context.ctx;
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.lineTo(x3, y3);
      ctx.closePath();
      return;
    }

    const vertices = [
      { from: { x: x1, y: y1 }, to: { x: x2, y: y2 } },
      { from: { x: x2, y: y2 }, to: { x: x3, y: y3 } },
      { from: { x: x3, y: y3 }, to: { x: x1, y: y1 } },
    ];

    const ctx = this.context.ctx;

    for (let i = 0; i < 3; i++) {
      const prevEdge = vertices[(i + 2) % 3];
      const currEdge = vertices[i];
      const corner = currEdge.from;

      const dx1 = corner.x - prevEdge.from.x;
      const dy1 = corner.y - prevEdge.from.y;
      const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);

      const dx2 = currEdge.to.x - corner.x;
      const dy2 = currEdge.to.y - corner.y;
      const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

      const nx1 = dx1 / len1;
      const ny1 = dy1 / len1;
      const nx2 = dx2 / len2;
      const ny2 = dy2 / len2;

      // 圆角半径上限 = 两边一半，避免过大触发回绕。
      const r = Math.min(cornerRadius, len1 / 2, len2 / 2);

      const beforeX = corner.x - nx1 * r;
      const beforeY = corner.y - ny1 * r;
      const afterX = corner.x + nx2 * r;
      const afterY = corner.y + ny2 * r;

      if (i === 0) {
        ctx.moveTo(beforeX, beforeY);
      } else {
        ctx.lineTo(beforeX, beforeY);
      }

      ctx.quadraticCurveTo(corner.x, corner.y, afterX, afterY);
    }

    ctx.closePath();
  }
}

export default TouchRenderer;
