/**
 * HOLD 三切片贴图对照 MajdataViewX（GPL-3.0）。公式见 arcadeMotion.ts；未复制 C# 或 HLSL。
 */
import { BaseRenderer } from "./BaseRenderer";
import { HoldStartNote, HoldEndNote, NoteRenderPosition, ButtonPosition } from "../types";
import { arcadeHoldStretch, canvasDistanceFromArcade, canvasSizeFromNativePx } from "../utils/arcadeMotion";
import { drawSkinSprite, holdEndSkinPath, holdSkinPath } from "./skinAtlas";

export class HoldRenderer extends BaseRenderer {
  renderHold(
    _startPosition: NoteRenderPosition,
    _endPosition: NoteRenderPosition,
    buttonPosition: ButtonPosition,
    _color: [string, string],
    isEx: boolean = false,
    startNote: HoldStartNote | null = null,
    endNote: HoldEndNote | null = null,
    currentTimeMs: number = 0,
    isBreakHold: boolean = false,
    isSimultaneous: boolean = false,
    exScaleFactor: number = 1,
  ): void {
    if (!startNote || !endNote) return;
    const stretch = arcadeHoldStretch(
      startNote.timingMs - currentTimeMs,
      endNote.timingMs - currentTimeMs,
      this.getNoteTravelSpeed(startNote),
    );
    if (!stretch) return;

    const angle = this.getButtonAngle(buttonPosition);
    const radius = this.context.radius;
    const headDist = canvasDistanceFromArcade(stretch.headDistance, radius);
    const tailDist = canvasDistanceFromArcade(stretch.tailDistance, radius);
    const headX = this.context.centerX + Math.cos(angle) * headDist;
    const headY = this.context.centerY + Math.sin(angle) * headDist;
    const tailX = this.context.centerX + Math.cos(angle) * tailDist;
    const tailY = this.context.centerY + Math.sin(angle) * tailDist;
    const on = currentTimeMs >= startNote.timingMs;
    const body = this.context.skin?.get(holdSkinPath(isBreakHold, isSimultaneous, on));
    if (!body) return;

    this.drawHoldBody(body, headX, headY, tailX, tailY, stretch.scale);
    if (isEx && this.context.config.highlightExNotes) {
      const ex = this.context.skin?.get('HoldSkins/hold_ex.png');
      if (ex) {
        this.drawHoldBody(ex, headX, headY, tailX, tailY, stretch.scale * exScaleFactor);
      }
    }
    if (stretch.barLen > 0) {
      const cap = this.context.skin?.get(holdEndSkinPath(isBreakHold, isSimultaneous));
      if (cap) {
        drawSkinSprite(this.context.ctx, cap, tailX, tailY, radius, {
          scale: stretch.scale,
          rotation: angle + Math.PI / 2,
        });
      }
    }
  }

  private drawHoldBody(
    image: HTMLImageElement,
    headX: number,
    headY: number,
    tailX: number,
    tailY: number,
    scale: number,
  ): void {
    const dx = tailX - headX;
    const dy = tailY - headY;
    const len = Math.hypot(dx, dy);
    const rot = Math.atan2(dy, dx);
    const width = canvasSizeFromNativePx(image.naturalWidth, this.context.radius) * scale;
    const capSrc = Math.min(58, Math.floor(image.naturalHeight / 2));
    const capH = canvasSizeFromNativePx(capSrc, this.context.radius) * scale;
    const midSrc = Math.max(image.naturalHeight - capSrc * 2, 1);
    const ctx = this.context.ctx;
    ctx.save();
    ctx.translate(headX, headY);
    ctx.rotate(rot - Math.PI / 2);
    if (len <= capH * 2) {
      ctx.drawImage(image, -width / 2, 0, width, Math.max(len, capH * 0.5));
    } else {
      const bodyLen = len - capH * 2;
      ctx.drawImage(image, 0, 0, image.naturalWidth, capSrc, -width / 2, 0, width, capH);
      ctx.drawImage(image, 0, capSrc, image.naturalWidth, midSrc, -width / 2, capH, width, bodyLen);
      ctx.drawImage(
        image,
        0,
        image.naturalHeight - capSrc,
        image.naturalWidth,
        capSrc,
        -width / 2,
        capH + bodyLen,
        width,
        capH,
      );
    }
    ctx.restore();
  }
}

export default HoldRenderer;
