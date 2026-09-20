import { applyEase } from './easing';
import {
  blendRgba,
  cssRgba,
  interpolateEased,
  sampleColor,
  type PreparedChart,
  type Rgba,
  type ValueSpan,
} from './chart-prepare';

export type LayoutNote = {
  lineIndex: number;
  kind: number;
  seconds: number;
  holdEndSeconds: number | null;
  x: number;
  y: number;
  holdY: number;
};

export type LayoutSpan = {
  startTick: number;
  easeType: number;
  startX: number;
  endX: number;
  startY: number;
  endY: number;
  startColor: string;
  endColor: string;
};

export type PreviewFrame = {
  nowSeconds: number;
  cameraScale: number;
  cameraX: number;
  canvases: { x: number; y: number }[];
  judgeXs: number[];
  judgeRings: (Rgba | null)[];
  lineWindows: { startSeconds: number; endSeconds: number }[];
  notes: LayoutNote[];
  spans: LayoutSpan[];
};

function sampleFirstEased(spans: readonly ValueSpan[], nowSeconds: number, fallback: number): number {
  let value = spans[0]?.from ?? fallback;
  for (const span of spans) {
    if (nowSeconds > span.endSeconds) continue;
    if (nowSeconds < span.startSeconds) break;
    value = interpolateEased(span.from, span.to, span.easeType, span.startSeconds, span.endSeconds, nowSeconds);
    break;
  }
  return value;
}

function sampleSpeedY(spans: readonly ValueSpan[], nowSeconds: number): number {
  let value = 0;
  for (const span of spans) {
    if (nowSeconds > span.endSeconds) continue;
    if (nowSeconds < span.startSeconds) break;
    value = (span.floorPosition ?? 0) + (nowSeconds - span.startSeconds) * span.from;
  }
  return value;
}

export function layoutPreviewFrame(chart: PreparedChart, nowSeconds: number): PreviewFrame {
  const cameraScale = sampleFirstEased(chart.camera.scaleSpans, nowSeconds, 1);
  const cameraX = sampleFirstEased(chart.camera.xSpans, nowSeconds, 0);
  const canvases = chart.canvases.map(canvas => {
    let x = (canvas.xSpans[0]?.from || 0) - cameraX;
    for (const span of canvas.xSpans) {
      if (nowSeconds > span.endSeconds) continue;
      if (nowSeconds < span.startSeconds) break;
      x = interpolateEased(span.from, span.to, span.easeType, span.startSeconds, span.endSeconds, nowSeconds) - cameraX;
    }
    return { x, y: sampleSpeedY(canvas.speedSpans, nowSeconds) };
  });

  const judgeXs: number[] = [];
  const judgeRings: (Rgba | null)[] = [];
  const lineWindows: { startSeconds: number; endSeconds: number }[] = [];
  const notes: LayoutNote[] = [];
  const spans: LayoutSpan[] = [];

  for (let lineIndex = 0; lineIndex < chart.lines.length; lineIndex += 1) {
    const line = chart.lines[lineIndex]!;
    lineWindows.push({ startSeconds: line.startSeconds, endSeconds: line.endSeconds });
    let judgeX = 0;
    for (const span of line.spans) {
      if (nowSeconds > span.endSeconds) continue;
      if (nowSeconds < span.startSeconds) break;
      const x1 = span.fromX + canvases[span.startCanvasIndex]!.x;
      const x2 = span.toX + canvases[span.endCanvasIndex]!.x;
      const y1 = span.fromY - canvases[span.startCanvasIndex]!.y;
      const y2 = span.toY - canvases[span.endCanvasIndex]!.y;
      judgeX = x1 + (x2 - x1) * applyEase(span.easeType, (0 - y1) / (y2 - y1));
    }
    judgeXs.push(judgeX);
    judgeRings.push(sampleColor(line.judgeRing, nowSeconds));
    const tint = sampleColor(line.tint, nowSeconds);

    for (const span of line.spans) {
      const startColor = tint ? blendRgba(span.fromColor, tint) : span.fromColor;
      const endColor = tint ? blendRgba(span.toColor, tint) : span.toColor;
      spans.push({
        startTick: span.startTick,
        easeType: span.easeType,
        startX: span.fromX + canvases[span.startCanvasIndex]!.x,
        endX: span.toX + canvases[span.endCanvasIndex]!.x,
        startY: span.fromY - canvases[span.startCanvasIndex]!.y,
        endY: span.toY - canvases[span.endCanvasIndex]!.y,
        startColor: cssRgba(startColor),
        endColor: cssRgba(endColor),
      });
    }

    for (const note of line.notes) {
      const span = line.spans[note.spanIndex]!;
      const x1 = span.fromX + canvases[span.startCanvasIndex]!.x;
      const x2 = span.toX + canvases[span.endCanvasIndex]!.x;
      let x = interpolateEased(x1, x2, span.easeType, span.startSeconds, span.endSeconds, note.seconds);
      if (note.kind === 2 && nowSeconds >= note.seconds) {
        for (const live of line.spans) {
          if (nowSeconds > live.endSeconds) continue;
          if (nowSeconds < live.startSeconds) break;
          const liveX1 = live.fromX + canvases[live.startCanvasIndex]!.x;
          const liveX2 = live.toX + canvases[live.endCanvasIndex]!.x;
          x = interpolateEased(liveX1, liveX2, live.easeType, live.startSeconds, live.endSeconds, nowSeconds);
        }
      }
      const holdCanvas = note.holdEndCanvasIndex ?? span.startCanvasIndex;
      notes.push({
        lineIndex,
        kind: note.kind,
        seconds: note.seconds,
        holdEndSeconds: note.holdEndSeconds ?? null,
        x,
        y: note.floorPosition - canvases[span.startCanvasIndex]!.y,
        holdY: (note.holdEndFloorPosition ?? note.floorPosition) - canvases[holdCanvas]!.y,
      });
    }
  }

  return {
    nowSeconds,
    cameraScale,
    cameraX,
    canvases,
    judgeXs,
    judgeRings,
    lineWindows,
    notes,
    spans,
  };
}
