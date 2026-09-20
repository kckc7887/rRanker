import { applyEase } from './easing';
import { cssRgba, type PreparedChart, type Rgba } from './chart-prepare';
import { layoutPreviewFrame, type LayoutSpan, type PreviewFrame } from './frame-layout';
import { visualSpeed } from '../configuration';

const HIT_DURATION_SECONDS = 0.7;
export const DESIGN_HEIGHT = 1920;
export const DESIGN_WIDTH = 1080;
export const FRAME_ASPECT = 9 / 16;
const JUDGE_LINE_RATIO = 0.74;
const SCROLL_UNIT_RATIO = 0.0777;
const LINE_STROKE = 10;
const JUDGE_RADIUS = 53;
const TAP_OUTER = 42;
const TAP_INNER = 26;
const DRAG_OUTER = 32;
const DRAG_INNER = 22;
const HOLD_OUTER = 34;
const HOLD_INNER = 27;
const HOLD_HALF_WIDTH = 23;
const HOLD_FADE_SECONDS = 0.25;
const CURVE_STEP = 0.03125;

function cssRgbaAlpha(color: Rgba, alpha: number): string {
  return `rgba(${color.r},${color.g},${color.b},${Math.max(0, Math.min(1, alpha))})`;
}

export type PlayfieldMetrics = {
  judgeLineY: number;
  noteScale: number;
  centerX: number;
  centerY: number;
  fieldWidth: number;
  frameHeight: number;
  scrollUnit: number;
};

/** Fit the 1080×1920 (9:16) playfield into a canvas, letterboxing leftover space. */
export function measurePlayfield(width: number, height: number): PlayfieldMetrics {
  const pixelWidth = Math.max(1, width);
  const pixelHeight = Math.max(1, height);
  const widerThanFrame = pixelWidth / pixelHeight >= FRAME_ASPECT;
  const frameHeight = widerThanFrame ? pixelHeight : pixelWidth / FRAME_ASPECT;
  const fieldWidth = widerThanFrame ? pixelHeight * FRAME_ASPECT : pixelWidth;
  return {
    judgeLineY: widerThanFrame
      ? pixelHeight * JUDGE_LINE_RATIO
      : (pixelWidth * JUDGE_LINE_RATIO) / FRAME_ASPECT + (pixelHeight - pixelWidth / FRAME_ASPECT) / 2,
    noteScale: widerThanFrame ? pixelHeight / DESIGN_HEIGHT : pixelWidth / DESIGN_WIDTH,
    centerX: pixelWidth / 2,
    centerY: pixelHeight / 2,
    fieldWidth,
    frameHeight,
    scrollUnit: SCROLL_UNIT_RATIO * frameHeight,
  };
}

export class RizlineRenderer {
  visualSpeed = visualSpeed(3.5);
  private judgeLineY = 0;
  private noteScale = 0;
  private centerX = 0;
  private centerY = 0;
  private fieldWidth = 0;
  private frameHeight = 0;
  private scrollUnit = 0;
  private readonly overlay: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly overlayContext: CanvasRenderingContext2D;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly stage: HTMLElement,
  ) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('无法创建 Canvas 2D');
    this.context = context;
    this.overlay = document.createElement('canvas');
    const overlayContext = this.overlay.getContext('2d');
    if (!overlayContext) throw new Error('无法创建叠加 Canvas');
    this.overlayContext = overlayContext;
    this.resize();
  }

  setUserSpeed(userSpeed: number): void {
    this.visualSpeed = visualSpeed(userSpeed);
  }

  resize(): void {
    const width = Math.max(1, this.stage.clientWidth * devicePixelRatio);
    const height = Math.max(1, this.stage.clientHeight * devicePixelRatio);
    this.canvas.width = width;
    this.canvas.height = height;
    this.overlay.width = width;
    this.overlay.height = height;
    this.context.lineCap = 'round';
    this.overlayContext.lineCap = 'round';
    const metrics = measurePlayfield(width, height);
    this.judgeLineY = metrics.judgeLineY;
    this.noteScale = metrics.noteScale;
    this.centerX = metrics.centerX;
    this.centerY = metrics.centerY;
    this.fieldWidth = metrics.fieldWidth;
    this.frameHeight = metrics.frameHeight;
    this.scrollUnit = metrics.scrollUnit;
  }

  render(chart: PreparedChart, nowSeconds: number): void {
    const frame = layoutPreviewFrame(chart, nowSeconds);
    const context = this.context;
    const scale = frame.cameraScale;
    const base = chart.themes[0]!;
    if (chart.challengeWindows.every(window => nowSeconds < window.transStartSeconds || nowSeconds > window.endSeconds)) {
      this.paintPlayfield(context, frame, nowSeconds, scale, base.fill, base.fillTransparent, base.fillHalf, base.noteFill);
    }
    const activeThemeIndex = chart.challengeWindows.reduce((current, window) => {
      if (nowSeconds > window.transStartSeconds && nowSeconds <= window.endSeconds) return window.themeIndex;
      return current;
    }, 0);
    for (const window of chart.challengeWindows) {
      if (window.themeIndex < activeThemeIndex) continue;
      const theme = chart.themes[window.themeIndex] ?? base;
      if (nowSeconds > window.endSeconds && nowSeconds <= window.transEndSeconds) {
        const wipe = 1 - (nowSeconds - window.endSeconds) / (window.transEndSeconds - window.endSeconds);
        context.globalCompositeOperation = 'destination-out';
        context.fillStyle = 'black';
        context.beginPath();
        context.arc(this.centerX, 0, this.centerY * 2 * wipe * 15, 0, Math.PI * 2);
        context.fill();
        this.paintPlayfield(this.overlayContext, frame, nowSeconds, scale, theme.fill, theme.fillTransparent, theme.fillHalf, theme.noteFill);
        context.globalCompositeOperation = 'destination-over';
        context.drawImage(this.overlay, 0, 0);
        context.globalCompositeOperation = 'source-over';
      } else if (nowSeconds > window.transStartSeconds && nowSeconds <= window.endSeconds) {
        this.paintPlayfield(context, frame, nowSeconds, scale, theme.fill, theme.fillTransparent, theme.fillHalf, theme.noteFill);
      } else if (nowSeconds > window.startSeconds && nowSeconds <= window.transStartSeconds) {
        const wipe = (nowSeconds - window.startSeconds) / (window.transStartSeconds - window.startSeconds);
        context.globalCompositeOperation = 'destination-out';
        context.fillStyle = 'black';
        context.beginPath();
        context.arc(this.centerX, this.centerY * 2, this.centerY * 2 * wipe * 15, 0, Math.PI * 2);
        context.fill();
        this.paintPlayfield(this.overlayContext, frame, nowSeconds, scale, theme.fill, theme.fillTransparent, theme.fillHalf, theme.noteFill);
        context.globalCompositeOperation = 'destination-over';
        context.drawImage(this.overlay, 0, 0);
        context.globalCompositeOperation = 'source-over';
      }
    }
    this.paintJudgeRings(frame, nowSeconds, scale);
    const theme = chart.themes[activeThemeIndex] ?? base;
    this.paintHitBursts(context, frame, nowSeconds, scale, theme.fx, activeThemeIndex > 0);
    context.fillStyle = 'rgba(0, 0, 0, 0.5)';
    context.fillRect(0, 0, this.centerX - this.fieldWidth / 2, this.canvas.height);
    context.fillRect(this.centerX + this.fieldWidth / 2, 0, this.centerX - this.fieldWidth / 2, this.canvas.height);
    context.fillRect(this.centerX - this.fieldWidth / 2, 0, this.fieldWidth, this.centerY - this.frameHeight / 2);
    context.fillRect(this.centerX - this.fieldWidth / 2, this.centerY + this.frameHeight / 2, this.fieldWidth, this.centerY - this.frameHeight / 2);
  }

  private paintJudgeRings(frame: PreviewFrame, nowSeconds: number, scale: number): void {
    const context = this.context;
    for (let index = 0; index < frame.judgeXs.length; index += 1) {
      const color = frame.judgeRings[index];
      const window = frame.lineWindows[index];
      if (!color || !window || nowSeconds < window.startSeconds || nowSeconds > window.endSeconds) continue;
      const x = this.centerX + frame.judgeXs[index]! * scale * this.fieldWidth;
      context.strokeStyle = cssRgba(color);
      context.lineWidth = this.noteScale * LINE_STROKE * scale;
      context.beginPath();
      context.arc(x, this.judgeLineY, this.noteScale * JUDGE_RADIUS * scale, 0, Math.PI * 2);
      context.stroke();
    }
  }

  private paintPlayfield(
    context: CanvasRenderingContext2D,
    frame: PreviewFrame,
    nowSeconds: number,
    scale: number,
    fill: string,
    fillTransparent: string,
    fillHalf: string,
    noteFill: string,
  ): void {
    context.fillStyle = fill;
    context.fillRect(0, 0, this.canvas.width, this.canvas.height);
    context.lineWidth = this.noteScale * LINE_STROKE;
    context.lineCap = 'round';
    const ordered = [...frame.spans].sort((left, right) => left.startTick - right.startTick);
    for (const span of ordered) this.strokeSpan(context, span, scale);
    {
      const gradient = context.createLinearGradient(0, this.centerY - this.frameHeight / 2, 0, this.centerY + this.frameHeight / 2);
      gradient.addColorStop(1324 / DESIGN_HEIGHT, fillTransparent);
      gradient.addColorStop(1388 / DESIGN_HEIGHT, fillHalf);
      gradient.addColorStop(1516 / DESIGN_HEIGHT, fill);
      context.fillStyle = gradient;
      context.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    this.paintNotes(context, frame, nowSeconds, scale, noteFill);
    {
      const gradient = context.createLinearGradient(0, this.centerY - this.frameHeight / 2, 0, this.centerY + this.frameHeight / 2);
      gradient.addColorStop(174 / DESIGN_HEIGHT, fill);
      gradient.addColorStop(302 / DESIGN_HEIGHT, fillHalf);
      gradient.addColorStop(366 / DESIGN_HEIGHT, fillTransparent);
      gradient.addColorStop(1584 / DESIGN_HEIGHT, fillTransparent);
      gradient.addColorStop(1709 / DESIGN_HEIGHT, fill);
      context.fillStyle = gradient;
      context.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  private paintHitBursts(
    context: CanvasRenderingContext2D,
    frame: PreviewFrame,
    nowSeconds: number,
    scale: number,
    fx: Rgba,
    challenge: boolean,
  ): void {
    const unit = this.noteScale * scale;
    for (const note of frame.notes) {
      const x = this.centerX + frame.judgeXs[note.lineIndex]! * scale * this.fieldWidth;
      this.strokeBurst(context, x, nowSeconds - note.seconds, note.kind, unit, fx, challenge);
      if (note.kind === 2 && note.holdEndSeconds != null) {
        this.strokeBurst(context, x, nowSeconds - note.holdEndSeconds, 0, unit, fx, challenge);
      }
    }
  }

  private strokeBurst(
    context: CanvasRenderingContext2D,
    x: number,
    age: number,
    noteKind: number,
    unit: number,
    fx: Rgba,
    challenge: boolean,
  ): void {
    if (age < 0 || age > HIT_DURATION_SECONDS) return;
    const progress = age / HIT_DURATION_SECONDS;
    const expand = 1 - (1 - progress) ** 3;
    const fade = (1 - progress) ** 2;
    const size = noteKind === 1 ? 0.72 : 1;
    const inner = unit * (28 + 96 * expand) * size;
    const ring = unit * (53 + 148 * expand) * size;
    context.fillStyle = cssRgbaAlpha(fx, 0.4 * fade);
    context.beginPath();
    context.arc(x, this.judgeLineY, inner, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = cssRgbaAlpha(fx, 0.95 * fade);
    context.lineWidth = Math.max(1, unit * 10 * (1 - expand * 0.55) * size);
    context.beginPath();
    context.arc(x, this.judgeLineY, ring, 0, Math.PI * 2);
    context.stroke();
    if (challenge) {
      context.strokeStyle = cssRgbaAlpha(fx, 0.42 * fade);
      context.lineWidth = Math.max(1, unit * 6 * size);
      context.beginPath();
      context.arc(x, this.judgeLineY, ring * 1.32, 0, Math.PI * 2);
      context.stroke();
    }
  }

  private strokeSpan(context: CanvasRenderingContext2D, span: LayoutSpan, scale: number): void {
    const y1 = span.startY * scale;
    const y2 = span.endY * scale;
    const screenY1 = this.judgeLineY - y1 * this.visualSpeed * this.scrollUnit;
    const screenY2 = this.judgeLineY - y2 * this.visualSpeed * this.scrollUnit;
    if (screenY1 < 0 && screenY2 < 0) return;
    if (screenY1 > this.canvas.height && screenY2 > this.canvas.height) return;
    const screenX1 = this.centerX + span.startX * scale * this.fieldWidth;
    const screenX2 = this.centerX + span.endX * scale * this.fieldWidth;
    context.beginPath();
    if (span.easeType === 0 || screenX1 === screenX2) {
      context.moveTo(screenX1, screenY1);
      context.lineTo(screenX2, screenY2);
    } else if (span.easeType === 13) {
      context.moveTo(screenX1, screenY1);
      context.lineTo(screenX1, screenY2);
    } else if (span.easeType === 14) {
      context.moveTo(screenX2, screenY1);
      context.lineTo(screenX2, screenY2);
    } else {
      context.moveTo(screenX1, screenY1);
      for (let t = 0; t < 1; t += CURVE_STEP) {
        context.lineTo(screenX1 + (screenX2 - screenX1) * applyEase(span.easeType, t), screenY1 + (screenY2 - screenY1) * t);
      }
      context.lineTo(screenX2, screenY2);
    }
    if (!Number.isNaN(screenY1) && !Number.isNaN(screenY2)) {
      if ((screenX1 === screenX2 && screenY1 === screenY2) || span.startColor === span.endColor) {
        context.strokeStyle = span.startColor;
      } else {
        const gradient = context.createLinearGradient(screenX1, screenY1, screenX2, screenY2);
        gradient.addColorStop(0, span.startColor);
        gradient.addColorStop(1, span.endColor);
        context.strokeStyle = gradient;
      }
    } else {
      context.strokeStyle = span.startColor;
    }
    context.stroke();
  }

  private paintNotes(
    context: CanvasRenderingContext2D,
    frame: PreviewFrame,
    nowSeconds: number,
    scale: number,
    noteFill: string,
  ): void {
    for (const note of frame.notes) {
      const remaining = note.seconds - nowSeconds;
      if (note.kind === 0) {
        if (remaining < 0) continue;
        const x = this.centerX + note.x * scale * this.fieldWidth;
        const y = this.judgeLineY - note.y * scale * this.visualSpeed * this.scrollUnit;
        context.fillStyle = 'black';
        context.beginPath();
        context.arc(x, y, this.noteScale * TAP_OUTER * scale, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = noteFill;
        context.beginPath();
        context.arc(x, y, this.noteScale * TAP_INNER * scale, 0, Math.PI * 2);
        context.fill();
      } else if (note.kind === 1) {
        if (remaining < 0) continue;
        const x = this.centerX + note.x * scale * this.fieldWidth;
        const y = this.judgeLineY - note.y * scale * this.visualSpeed * this.scrollUnit;
        context.fillStyle = 'black';
        context.beginPath();
        context.arc(x, y, this.noteScale * DRAG_OUTER * scale, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = 'white';
        context.beginPath();
        context.arc(x, y, this.noteScale * DRAG_INNER * scale, 0, Math.PI * 2);
        context.fill();
      } else if (note.kind === 2) {
        const holdEnd = note.holdEndSeconds ?? note.seconds;
        if (holdEnd - nowSeconds < -HOLD_FADE_SECONDS) continue;
        const x = this.centerX + note.x * scale * this.fieldWidth;
        const y = this.judgeLineY - (remaining < 0 ? 0 : note.y * scale * this.visualSpeed * this.scrollUnit);
        context.strokeStyle = 'black';
        context.fillStyle = noteFill;
        context.lineWidth = this.noteScale * LINE_STROKE * scale;
        if (holdEnd - nowSeconds < 0) {
          const fade = 1 - ((nowSeconds - holdEnd) / HOLD_FADE_SECONDS) ** 3;
          context.beginPath();
          context.arc(x, y, this.noteScale * HOLD_OUTER * scale * fade, 0, Math.PI * 2);
          context.stroke();
          context.beginPath();
          context.arc(x, y, this.noteScale * HOLD_INNER * scale * fade, 0, Math.PI * 2);
          context.fillStyle = 'white';
          context.fill();
          context.stroke();
          continue;
        }
        context.beginPath();
        context.arc(x, y, this.noteScale * HOLD_OUTER * scale, 0, Math.PI * 2);
        context.stroke();
        const half = this.noteScale * HOLD_HALF_WIDTH * scale;
        const tailY = this.judgeLineY - note.holdY * scale * this.visualSpeed * this.scrollUnit;
        if (y) {
          const gradient = context.createLinearGradient(x, y, x, tailY);
          gradient.addColorStop(0 / 63, noteFill);
          gradient.addColorStop(36 / 63, noteFill);
          gradient.addColorStop(63 / 63, 'rgba(255, 255, 255, 0)');
          context.fillStyle = gradient;
        }
        context.fillRect(x - half, tailY, half * 2, y - tailY);
        context.beginPath();
        context.moveTo(x - half, y);
        context.lineTo(x - half, tailY);
        context.moveTo(x + half, y);
        context.lineTo(x + half, tailY);
        context.stroke();
        context.beginPath();
        context.arc(x, y, this.noteScale * HOLD_INNER * scale, 0, Math.PI * 2);
        context.fillStyle = 'white';
        context.fill();
        context.stroke();
      }
    }
  }
}
