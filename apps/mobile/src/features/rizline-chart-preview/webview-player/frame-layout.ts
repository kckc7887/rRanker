import { applyEase } from './easing';
import { createIntervalIndex } from '../../chart-preview-shared/webview-player/interval-index';
import {
  blendRgba,
  activeSpans,
  cssRgba,
  interpolateEased,
  sampleColor,
  type PreparedChart,
  type Rgba,
  type ValueSpan,
  type PreviewLine,
  type PreviewNote,
  type LineSpan,
} from './chart-prepare';

export type LayoutViewport = { height: number; judgeLineY: number; scrollUnit: number; visualSpeed: number; noteRadius: number };
type SpatialGroup<T> = { startCanvas: number; endCanvas: number; query: (min: number, max: number) => T[] };
function spatialGroups<T>(items: readonly T[], geometry: (item: T) => [number, number, number, number]): SpatialGroup<T>[] {
  const groups = new Map<string, { startCanvas: number; endCanvas: number; items: T[] }>();
  for (const item of items) {
    const [startCanvas, endCanvas] = geometry(item);
    const key = `${startCanvas}:${endCanvas}`;
    let group = groups.get(key);
    if (!group) { group = { startCanvas, endCanvas, items: [] }; groups.set(key, group); }
    group.items.push(item);
  }
  return [...groups.values()].map(group => ({ ...group, query: createIntervalIndex(group.items, item => {
    const [, , a, b] = geometry(item); return [a, b];
  }) }));
}
const lineIndices = new WeakMap<PreviewLine, {
  notes: SpatialGroup<PreviewNote>[]; spans: SpatialGroup<LineSpan>[];
  effects: (min: number, max: number) => PreviewNote[];
  noteOrder: Map<PreviewNote, number>; spanOrder: Map<LineSpan, number>;
}>();
function indices(line: PreviewLine) {
  let index = lineIndices.get(line);
  if (!index) {
    index = {
      notes: spatialGroups(line.notes, note => {
        const canvas = line.spans[note.spanIndex]!.startCanvasIndex;
        return [canvas, note.holdEndCanvasIndex ?? canvas, note.floorPosition, note.holdEndFloorPosition ?? note.floorPosition];
      }),
      spans: spatialGroups(line.spans, span => [span.startCanvasIndex, span.endCanvasIndex, span.fromY, span.toY]),
      effects: createIntervalIndex(line.notes, note => [note.seconds, (note.holdEndSeconds ?? note.seconds) + 0.7]),
      noteOrder: new Map(line.notes.map((note, order) => [note, order])),
      spanOrder: new Map(line.spans.map((span, order) => [span, order])),
    };
    lineIndices.set(line, index);
  }
  return index;
}
const spanOrders = new WeakMap<PreparedChart, Map<LineSpan, number>>();
function spanOrder(chart: PreparedChart): Map<LineSpan, number> {
  let order = spanOrders.get(chart);
  if (!order) {
    order = new Map(chart.lines.flatMap(line => line.spans).sort((a, b) => a.startTick - b.startTick).map((span, rank) => [span, rank]));
    spanOrders.set(chart, order);
  }
  return order;
}
function spatialCandidates<T>(groups: SpatialGroup<T>[], canvases: { y: number }[], min: number, max: number): T[] {
  const result: T[] = [];
  for (const group of groups) {
    const a = canvases[group.startCanvas]!.y, b = canvases[group.endCanvas]!.y;
    for (const item of group.query(min + Math.min(a, b), max + Math.max(a, b))) result.push(item);
  }
  return result;
}

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
  for (const span of activeSpans(spans, nowSeconds)) {
    if (nowSeconds > span.endSeconds) continue;
    if (nowSeconds < span.startSeconds) break;
    value = interpolateEased(span.from, span.to, span.easeType, span.startSeconds, span.endSeconds, nowSeconds);
    break;
  }
  return value;
}

function sampleSpeedY(spans: readonly ValueSpan[], nowSeconds: number): number {
  let value = 0;
  for (const span of activeSpans(spans, nowSeconds)) {
    if (nowSeconds > span.endSeconds) continue;
    if (nowSeconds < span.startSeconds) break;
    value = (span.floorPosition ?? 0) + (nowSeconds - span.startSeconds) * span.from;
  }
  return value;
}

export function layoutPreviewFrame(chart: PreparedChart, nowSeconds: number, viewport?: LayoutViewport): PreviewFrame {
  const cameraScale = sampleFirstEased(chart.camera.scaleSpans, nowSeconds, 1);
  const cameraX = sampleFirstEased(chart.camera.xSpans, nowSeconds, 0);
  const canvases = chart.canvases.map(canvas => {
    let x = (canvas.xSpans[0]?.from || 0) - cameraX;
    for (const span of activeSpans(canvas.xSpans, nowSeconds)) {
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
  const bounds = frameBounds(cameraScale, viewport);
  const { bounded, minY, maxY } = bounds;
  const drawOrder = viewport ? spanOrder(chart) : null;
  const frameOrder = new Map<LayoutSpan, number>();

  for (let lineIndex = 0; lineIndex < chart.lines.length; lineIndex += 1) {
    const line = chart.lines[lineIndex]!;
    const index = bounded ? indices(line) : null;
    const liveSpans = activeSpans(line.spans, nowSeconds);
    lineWindows.push({ startSeconds: line.startSeconds, endSeconds: line.endSeconds });
    let judgeX = 0;
    for (const span of liveSpans) {
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
    const selectedSpans = index ? spatialCandidates(index.spans, canvases, minY, maxY)
      .sort((a, b) => index.spanOrder.get(a)! - index.spanOrder.get(b)!) : line.spans;
    const selectedNotes = index ? [...new Set([
      ...spatialCandidates(index.notes, canvases, minY, maxY), ...index.effects(nowSeconds, nowSeconds),
    ])].sort((a, b) => index.noteOrder.get(a)! - index.noteOrder.get(b)!) : line.notes;

    for (const span of selectedSpans) {
      const startColor = tint ? blendRgba(span.fromColor, tint) : span.fromColor;
      const endColor = tint ? blendRgba(span.toColor, tint) : span.toColor;
      const layout: LayoutSpan = {
        startTick: span.startTick,
        easeType: span.easeType,
        startX: span.fromX + canvases[span.startCanvasIndex]!.x,
        endX: span.toX + canvases[span.endCanvasIndex]!.x,
        startY: span.fromY - canvases[span.startCanvasIndex]!.y,
        endY: span.toY - canvases[span.endCanvasIndex]!.y,
        startColor: cssRgba(startColor),
        endColor: cssRgba(endColor),
      };
      spans.push(layout);
      if (drawOrder) frameOrder.set(layout, drawOrder.get(span)!);
    }

    for (const note of selectedNotes) {
      const layout = layoutNote(note, line, lineIndex, nowSeconds, canvases, liveSpans, bounds);
      if (layout) notes.push(layout);
    }
  }

  if (drawOrder) spans.sort((a, b) => frameOrder.get(a)! - frameOrder.get(b)!);
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
function frameBounds(cameraScale: number, viewport?: LayoutViewport) {
  const unit = viewport ? cameraScale * viewport.visualSpeed * viewport.scrollUnit : 0;
  const bounded = viewport && Number.isFinite(unit) && unit !== 0;
  const margin = viewport ? Math.abs(cameraScale) * viewport.noteRadius : 0;
  const a = bounded ? (viewport.judgeLineY - viewport.height - margin) / unit : -Infinity;
  const b = bounded ? (viewport.judgeLineY + margin) / unit : Infinity;
  const minY = Math.min(a, b), maxY = Math.max(a, b);
  return { bounded: Boolean(bounded), minY, maxY };
}

function layoutNote(note: PreviewNote, line: PreviewLine, lineIndex: number, nowSeconds: number,
  canvases: PreviewFrame['canvases'], liveSpans: readonly LineSpan[], bounds: ReturnType<typeof frameBounds>): LayoutNote | null {
  const span = line.spans[note.spanIndex]!;
  const holdCanvas = note.holdEndCanvasIndex ?? span.startCanvasIndex;
  const y = note.floorPosition - canvases[span.startCanvasIndex]!.y;
  const holdY = (note.holdEndFloorPosition ?? note.floorPosition) - canvases[holdCanvas]!.y;
  if (bounds.bounded) {
    const end = note.holdEndSeconds ?? note.seconds;
    const effect = nowSeconds >= note.seconds && nowSeconds <= end + 0.7;
    if (!effect && (end < nowSeconds || Math.max(y, holdY) < bounds.minY || Math.min(y, holdY) > bounds.maxY)) return null;
  }
  const x1 = span.fromX + canvases[span.startCanvasIndex]!.x;
  const x2 = span.toX + canvases[span.endCanvasIndex]!.x;
  let x = interpolateEased(x1, x2, span.easeType, span.startSeconds, span.endSeconds, note.seconds);
  if (note.kind === 2 && nowSeconds >= note.seconds) {
    for (const live of liveSpans) {
      if (nowSeconds > live.endSeconds) continue;
      if (nowSeconds < live.startSeconds) break;
      const liveX1 = live.fromX + canvases[live.startCanvasIndex]!.x;
      const liveX2 = live.toX + canvases[live.endCanvasIndex]!.x;
      x = interpolateEased(liveX1, liveX2, live.easeType, live.startSeconds, live.endSeconds, nowSeconds);
    }
  }
  return {
    lineIndex,
    kind: note.kind,
    seconds: note.seconds,
    holdEndSeconds: note.holdEndSeconds ?? null,
    x,
    y,
    holdY,
  };
}
