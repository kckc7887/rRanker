import { applyEase } from './easing';

export type Rgba = { r: number; g: number; b: number; a: number };

export type ValueSpan = {
  startTick: number;
  endTick: number;
  startSeconds: number;
  endSeconds: number;
  from: number;
  to: number;
  easeType: number;
  floorPosition: number;
};

export type ColorSpan = {
  startSeconds: number;
  endSeconds: number;
  from: Rgba;
  to: Rgba;
};

export type LineSpan = {
  lineId: number;
  startTick: number;
  endTick: number;
  startSeconds: number;
  endSeconds: number;
  fromX: number;
  toX: number;
  fromY: number;
  toY: number;
  easeType: number;
  startCanvasIndex: number;
  endCanvasIndex: number;
  fromColor: Rgba;
  toColor: Rgba;
};

export type PreviewNote = {
  id: number;
  kind: number;
  tick: number;
  seconds: number;
  floorPosition: number;
  spanIndex: number;
  holdEndTick?: number;
  holdEndCanvasIndex?: number;
  holdEndFloorPosition?: number;
  holdEndSeconds?: number;
};

export type PreviewTheme = {
  fill: string;
  fillTransparent: string;
  fillHalf: string;
  noteFill: string;
  fxFill: string;
  fx: Rgba;
};

export type ChallengeWindow = {
  themeIndex: number;
  startSeconds: number;
  endSeconds: number;
  transStartSeconds: number;
  transEndSeconds: number;
};

export type PreviewCanvas = {
  index: number;
  xSpans: ValueSpan[];
  speedSpans: ValueSpan[];
};

export type PreviewLine = {
  id: number;
  startSeconds: number;
  endSeconds: number;
  spans: LineSpan[];
  notes: PreviewNote[];
  judgeRing: ColorSpan[];
  tint: ColorSpan[];
};

export type PreparedChart = {
  bpm: number;
  delaySeconds: number;
  durationSeconds: number;
  themes: PreviewTheme[];
  challengeWindows: ChallengeWindow[];
  canvases: PreviewCanvas[];
  camera: {
    scaleSpans: ValueSpan[];
    xSpans: ValueSpan[];
  };
  lines: PreviewLine[];
};

type JsonObject = Record<string, unknown>;

function asObject(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} 无效`);
  return value as JsonObject;
}

function asList(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} 不是数组`);
  return value;
}

function readRgba(value: unknown, label: string): Rgba {
  const row = asObject(value, label);
  const r = Number(row.r);
  const g = Number(row.g);
  const b = Number(row.b);
  const a = Number(row.a);
  if (![r, g, b, a].every(Number.isFinite)) throw new Error(`${label} 颜色无效`);
  return { r, g, b, a };
}

export function cssRgba({ r, g, b, a }: Rgba): string {
  return `rgba(${r},${g},${b},${a / 255})`;
}

export function blendRgba(base: Rgba, overlay: Rgba): Rgba {
  if (overlay.a === 0) return { r: base.r, g: base.g, b: base.b, a: base.a };
  if (overlay.a === 255) return { r: overlay.r, g: overlay.g, b: overlay.b, a: base.a };
  const weight = overlay.a / 255;
  return {
    r: base.r + (overlay.r - base.r) * weight,
    g: base.g + (overlay.g - base.g) * weight,
    b: base.b + (overlay.b - base.b) * weight,
    a: base.a,
  };
}

function pairNumeric(points: { tick: number; value: number; easeType: number; floorPosition: number }[]): ValueSpan[] {
  return points.map((point, index) => {
    const next = points[index + 1];
    return {
      startTick: point.tick,
      endTick: next ? next.tick : Infinity,
      startSeconds: 0,
      endSeconds: 0,
      from: point.value,
      to: next ? next.value : point.value,
      easeType: point.easeType,
      floorPosition: point.floorPosition,
    };
  });
}

function pairColors(points: { tick: number; from: Rgba; to: Rgba | null }[]): ColorSpan[] {
  return points.map((point, index) => {
    const next = points[index + 1];
    return {
      startSeconds: 0,
      endSeconds: 0,
      from: point.from,
      to: point.to ?? (next ? next.from : point.from),
    };
  });
}

function fillValueSeconds(spans: ValueSpan[], secondsAt: (tick: number) => number): void {
  for (const span of spans) {
    span.startSeconds = secondsAt(span.startTick);
    span.endSeconds = secondsAt(span.endTick);
  }
}

function fillColorSeconds(spans: ColorSpan[], points: { tick: number }[], secondsAt: (tick: number) => number): void {
  for (let index = 0; index < spans.length; index += 1) {
    const span = spans[index]!;
    const next = points[index + 1];
    span.startSeconds = secondsAt(points[index]!.tick);
    span.endSeconds = secondsAt(next ? next.tick : Infinity);
  }
}

function secondsAtTick(tick: number, bpm: number, shifts: ValueSpan[]): number {
  let seconds = Infinity;
  for (const shift of shifts) {
    if (tick > shift.endTick) continue;
    if (tick < shift.startTick) break;
    seconds = shift.floorPosition + ((tick - shift.startTick) / shift.from / bpm) * 60;
    break;
  }
  return seconds;
}

function readColorKeyframe(row: JsonObject, label: string): { tick: number; from: Rgba; to: Rgba | null } {
  const tick = Number(row.time);
  if (row.color != null) {
    return { tick, from: readRgba(row.color, `${label}.color`), to: null };
  }
  if (row.startColor != null) {
    return {
      tick,
      from: readRgba(row.startColor, `${label}.startColor`),
      to: row.endColor == null ? null : readRgba(row.endColor, `${label}.endColor`),
    };
  }
  throw new Error(`${label} 颜色无效`);
}

function readValuePoints(raw: unknown, label: string): { tick: number; value: number; easeType: number; floorPosition: number }[] {
  return asList(raw, label).map((item, index) => {
    const row = asObject(item, `${label}[${index}]`);
    return {
      tick: Number(row.time),
      value: Number(row.value),
      easeType: Number(row.easeType ?? 0),
      floorPosition: Number(row.floorPosition ?? 0),
    };
  });
}

export function sampleColor(spans: readonly ColorSpan[], nowSeconds: number): Rgba | null {
  if (!spans.length) return null;
  let current: Rgba = spans[0]!.from;
  for (const span of spans) {
    if (nowSeconds > span.endSeconds) continue;
    if (nowSeconds < span.startSeconds) break;
    const progress = (nowSeconds - span.startSeconds) / (span.endSeconds - span.startSeconds);
    current = {
      r: span.from.r + (span.to.r - span.from.r) * progress,
      g: span.from.g + (span.to.g - span.from.g) * progress,
      b: span.from.b + (span.to.b - span.from.b) * progress,
      a: span.from.a + (span.to.a - span.from.a) * progress,
    };
    break;
  }
  return current;
}

export function interpolateEased(from: number, to: number, easeType: number, startSeconds: number, endSeconds: number, nowSeconds: number): number {
  return from + (to - from) * applyEase(easeType, (nowSeconds - startSeconds) / (endSeconds - startSeconds));
}

export function prepareOfficialChart(raw: unknown): PreparedChart {
  const source = asObject(raw, '谱面');
  const bpm = Number(source.bPM);
  if (!Number.isFinite(bpm) || bpm <= 0) throw new Error('谱面 BPM 无效');

  const shiftRows = asList(source.bpmShifts ?? [], 'bpmShifts');
  const bpmPoints = shiftRows.length
    ? readValuePoints(shiftRows, 'bpmShifts')
    : [{ tick: 0, value: 1, easeType: 0, floorPosition: 0 }];
  const bpmSpans = pairNumeric(bpmPoints);
  const secondsAt = (tick: number) => secondsAtTick(tick, bpm, bpmSpans);
  fillValueSeconds(bpmSpans, secondsAt);

  const themes = asList(source.themes, 'themes').map((item, themeIndex) => {
    const colors = asList(asObject(item, `themes[${themeIndex}]`).colorsList, 'colorsList');
    if (colors.length < 3) throw new Error('theme.colorsList 不足 3 项');
    const background = readRgba(colors[0], 'theme.bg');
    const note = readRgba(colors[1], 'theme.note');
    const fx = readRgba(colors[2], 'theme.fx');
    return {
      fill: cssRgba(background),
      fillTransparent: cssRgba({ ...background, a: 0 }),
      fillHalf: cssRgba({ ...background, a: 127.5 }),
      noteFill: cssRgba(note),
      fxFill: cssRgba(fx),
      fx,
    };
  });
  if (!themes.length) throw new Error('谱面没有 theme');

  const challengeWindows = asList(source.challengeTimes ?? [], 'challengeTimes').map((item, index) => {
    const row = asObject(item, `challengeTimes[${index}]`);
    const startSeconds = secondsAt(Number(row.start));
    const endSeconds = secondsAt(Number(row.end));
    const transTime = Number(row.transTime ?? 0);
    return {
      themeIndex: index + 1,
      startSeconds,
      endSeconds,
      transStartSeconds: startSeconds + transTime,
      transEndSeconds: endSeconds + transTime,
    };
  });

  const canvasRows = asList(source.canvasMoves, 'canvasMoves');
  const canvases: PreviewCanvas[] = canvasRows.map((item, index) => {
    const row = asObject(item, `canvasMoves[${index}]`);
    if (row.index !== index) throw new Error('CanvasMove index is not correct');
    const xSpans = pairNumeric(readValuePoints(row.xPositionKeyPoints ?? [], 'xPositionKeyPoints'));
    const speedSpans = pairNumeric(readValuePoints(row.speedKeyPoints ?? [], 'speedKeyPoints'));
    fillValueSeconds(xSpans, secondsAt);
    fillValueSeconds(speedSpans, secondsAt);
    return { index, xSpans, speedSpans };
  });

  const cameraRow = asObject(source.cameraMove, 'cameraMove');
  const scaleSpans = pairNumeric(readValuePoints(cameraRow.scaleKeyPoints ?? [], 'scaleKeyPoints'));
  const cameraXSpans = pairNumeric(readValuePoints(cameraRow.xPositionKeyPoints ?? [], 'camera.xPositionKeyPoints'));
  fillValueSeconds(scaleSpans, secondsAt);
  fillValueSeconds(cameraXSpans, secondsAt);

  const lineRows = asList(source.lines, 'lines');
  let durationSeconds = 0;
  const lines: PreviewLine[] = lineRows.map((item, lineId) => {
    const row = asObject(item, `lines[${lineId}]`);
    const rawPoints = asList(row.linePoints, 'linePoints');
    if (!rawPoints.length) throw new Error('线没有 linePoints');
    const pointRecords = rawPoints.map((point, index) => {
      const entry = asObject(point, `linePoints[${index}]`);
      return {
        tick: Number(entry.time),
        x: Number(entry.xPosition),
        y: Number(entry.floorPosition),
        canvasIndex: Number(entry.canvasIndex),
        easeType: Number(entry.easeType ?? 0),
        color: readRgba(entry.color, 'linePoint.color'),
      };
    });
    const startSeconds = secondsAt(pointRecords[0]!.tick);
    const endSeconds = secondsAt(pointRecords[pointRecords.length - 1]!.tick);
    durationSeconds = Math.max(durationSeconds, endSeconds || 0);
    const spans: LineSpan[] = pointRecords.map((point, index) => {
      const next = pointRecords[index + 1];
      return {
        lineId,
        startTick: point.tick,
        endTick: next ? next.tick : Infinity,
        startSeconds: secondsAt(point.tick),
        endSeconds: secondsAt(next ? next.tick : Infinity),
        fromX: point.x,
        toX: next ? next.x : point.x,
        fromY: point.y,
        toY: next ? next.y : point.y,
        easeType: point.easeType,
        startCanvasIndex: point.canvasIndex,
        endCanvasIndex: next ? next.canvasIndex : point.canvasIndex,
        fromColor: point.color,
        toColor: next ? next.color : point.color,
      };
    });

    const notes: PreviewNote[] = asList(row.notes ?? [], 'notes').map((noteValue, noteId) => {
      const note = asObject(noteValue, `notes[${noteId}]`);
      const seconds = secondsAt(Number(note.time));
      durationSeconds = Math.max(durationSeconds, seconds || 0);
      let spanIndex = -1;
      for (let index = 0; index < spans.length; index += 1) {
        const span = spans[index]!;
        if (span.startSeconds <= seconds && seconds <= span.endSeconds && span.endSeconds !== Infinity) {
          spanIndex = index;
        }
      }
      if (spanIndex < 0) throw new Error('音符不在线上');
      const prepared: PreviewNote = {
        id: noteId,
        kind: Number(note.type),
        tick: Number(note.time),
        seconds,
        floorPosition: Number(note.floorPosition),
        spanIndex,
      };
      const extra = Array.isArray(note.otherInformations) ? note.otherInformations as number[] : [];
      if (prepared.kind === 2) {
        if (extra.length !== 3) throw new Error('Hold 缺少 otherInformations');
        prepared.holdEndTick = extra[0];
        prepared.holdEndCanvasIndex = extra[1];
        prepared.holdEndFloorPosition = extra[2];
        prepared.holdEndSeconds = secondsAt(Number(extra[0]));
        durationSeconds = Math.max(durationSeconds, prepared.holdEndSeconds || 0);
      }
      return prepared;
    });

    const judgePoints = asList(row.judgeRingColor ?? [], 'judgeRingColor').map((entry, index) => {
      const point = asObject(entry, `judgeRingColor[${index}]`);
      return readColorKeyframe(point, 'judgeRingColor');
    });
    const tintPoints = asList(row.lineColor ?? [], 'lineColor').map((entry, index) => {
      const point = asObject(entry, `lineColor[${index}]`);
      return readColorKeyframe(point, 'lineColor');
    });
    const judgeRing = pairColors(judgePoints);
    const tint = pairColors(tintPoints);
    fillColorSeconds(judgeRing, judgePoints, secondsAt);
    fillColorSeconds(tint, tintPoints, secondsAt);

    return { id: lineId, startSeconds, endSeconds, spans, notes, judgeRing, tint };
  });

  const delayMs = typeof source.chartDelayMs === 'number' && Number.isFinite(source.chartDelayMs) ? source.chartDelayMs : 0;
  const offset = typeof source.offset === 'number' && Number.isFinite(source.offset) ? source.offset : 0;

  return {
    bpm,
    delaySeconds: delayMs / 1000 + offset,
    durationSeconds,
    themes,
    challengeWindows,
    canvases,
    camera: { scaleSpans, xSpans: cameraXSpans },
    lines,
  };
}

export function hitEvents(chart: PreparedChart): { seconds: number; type: number }[] {
  const events: { seconds: number; type: number }[] = [];
  for (const line of chart.lines) {
    for (const note of line.notes) events.push({ seconds: note.seconds, type: note.kind });
  }
  events.sort((a, b) => a.seconds - b.seconds);
  return events;
}
