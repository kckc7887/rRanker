import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyEase } from '@/features/rizline-chart-preview/webview-player/easing';
import { hitEvents, prepareOfficialChart } from '@/features/rizline-chart-preview/webview-player/chart-prepare';
import { layoutPreviewFrame } from '@/features/rizline-chart-preview/webview-player/frame-layout';
import { clampUserSpeed, visualSpeed } from '@/features/rizline-chart-preview/configuration';

const fixtures = resolve(process.cwd(), 'tests/fixtures/rizline-chart-preview');

function color() {
  return { r: 255, g: 255, b: 255, a: 255 };
}

function fixture(overrides: Record<string, unknown> = {}) {
  return {
    fileVersion: 0,
    songsName: 'Test',
    themes: [{ colorsList: [color(), color(), color()] }],
    challengeTimes: [],
    bPM: 120,
    bpmShifts: [],
    offset: 0,
    chartDelayMs: 0,
    lines: [{
      linePoints: [
        { time: 0, xPosition: 0, color: color(), easeType: 0, canvasIndex: 0, floorPosition: 0 },
        { time: 4, xPosition: 0, color: color(), easeType: 0, canvasIndex: 0, floorPosition: 4 },
      ],
      notes: [
        { type: 0, time: 1, floorPosition: 1, otherInformations: [] },
        { type: 2, time: 2, floorPosition: 2, otherInformations: [3, 0, 3] },
      ],
      judgeRingColor: [{ time: 0, color: color() }],
      lineColor: [{ time: 0, color: { r: 0, g: 0, b: 0, a: 0 } }],
    }],
    canvasMoves: [{
      index: 0,
      xPositionKeyPoints: [{ time: 0, value: 0, easeType: 0, floorPosition: 0 }],
      speedKeyPoints: [{ time: 0, value: 1, easeType: 0, floorPosition: 0 }],
    }],
    cameraMove: {
      scaleKeyPoints: [{ time: 0, value: 1, easeType: 0, floorPosition: 0 }],
      xPositionKeyPoints: [{ time: 0, value: 0, easeType: 0, floorPosition: 0 }],
    },
    ...overrides,
  };
}

function round(value: number): number {
  if (!Number.isFinite(value)) return value;
  return Number(value.toPrecision(12));
}

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function noteRecord(note: { kind: number; seconds: number; x: number; y: number; holdY: number; holdEndSeconds: number | null }) {
  return {
    type: note.kind,
    seconds: round(note.seconds),
    x: round(note.x),
    y: round(note.y),
    holdY: note.kind === 2 ? round(note.holdY) : null,
    holdEndSeconds: note.holdEndSeconds == null ? null : round(note.holdEndSeconds),
  };
}

function spanRecord(span: { startColor: string; endColor: string; startX: number; endX: number; startY: number; endY: number; easeType: number }) {
  return {
    startColor: span.startColor,
    endColor: span.endColor,
    startX: round(span.startX),
    endX: round(span.endX),
    startY: round(span.startY),
    endY: round(span.endY),
    easeType: span.easeType,
  };
}

type GoldenChart = {
  delaySeconds: number;
  durationSeconds: number;
  themeCount: number;
  challengeCount: number;
  lineCount: number;
  noteCount: number;
  hits: { seconds: number; type: number }[];
  themes: { bgColor: string; bgColor0: string; bgColor1: string; noteColor: string; fxColor: string; fx: { r: number; g: number; b: number; a: number } }[];
  challenges: { themeIndex: number; startSeconds: number; endSeconds: number; transStartSeconds: number; transEndSeconds: number }[];
  frames: {
    nowSeconds: number;
    camera: { scale: number; x: number };
    canvases: { x: number; y: number }[];
    judgeXs: number[];
    judgeRings: ({ r: number; g: number; b: number; a: number } | null)[];
    noteDigest: string;
    spanDigest: string;
    notes: ReturnType<typeof noteRecord>[];
    spans: ReturnType<typeof spanRecord>[];
  }[];
};

function assertMatchesGolden(raw: unknown, golden: GoldenChart, detailed: boolean): void {
  const chart = prepareOfficialChart(raw);
  expect(round(chart.delaySeconds)).toBe(golden.delaySeconds);
  expect(round(chart.durationSeconds)).toBe(golden.durationSeconds);
  expect(chart.themes).toHaveLength(golden.themeCount);
  expect(chart.challengeWindows).toHaveLength(golden.challengeCount);
  expect(chart.lines).toHaveLength(golden.lineCount);
  const hits = hitEvents(chart).map((event) => ({ seconds: round(event.seconds), type: event.type }));
  expect(hits).toHaveLength(golden.noteCount);
  expect(hits.slice(0, 40)).toEqual(golden.hits);
  expect(chart.themes.map((theme) => ({
    bgColor: theme.fill,
    bgColor0: theme.fillTransparent,
    bgColor1: theme.fillHalf,
    noteColor: theme.noteFill,
    fxColor: theme.fxFill,
    fx: theme.fx,
  }))).toEqual(golden.themes);
  expect(chart.challengeWindows.map((window) => ({
    themeIndex: window.themeIndex,
    startSeconds: round(window.startSeconds),
    endSeconds: round(window.endSeconds),
    transStartSeconds: round(window.transStartSeconds),
    transEndSeconds: round(window.transEndSeconds),
  }))).toEqual(golden.challenges);

  for (const expected of golden.frames) {
    const frame = layoutPreviewFrame(chart, expected.nowSeconds);
    expect({ scale: round(frame.cameraScale), x: round(frame.cameraX) }).toEqual(expected.camera);
    expect(frame.canvases.map((canvas) => ({ x: round(canvas.x), y: round(canvas.y) }))).toEqual(expected.canvases);
    expect(frame.judgeXs.map(round)).toEqual(expected.judgeXs);
    const notes = frame.notes.map(noteRecord);
    const spans = frame.spans.map(spanRecord);
    expect(digest(notes)).toBe(expected.noteDigest);
    expect(digest(spans)).toBe(expected.spanDigest);
    if (detailed) {
      expect(notes).toEqual(expected.notes);
      expect(spans).toEqual(expected.spans);
      expect(frame.judgeRings).toEqual(expected.judgeRings);
    }
  }
}

describe('Rizline official chart prepare', () => {
  it('empty bpmShifts still converts ticks to seconds', () => {
    const chart = prepareOfficialChart(fixture());
    expect(chart.lines[0]?.notes[0]?.seconds).toBe(0.5);
    expect(chart.lines[0]?.notes[1]?.holdEndSeconds).toBe(1.5);
  });

  it('hold otherInformations become end time, canvas and floorPosition', () => {
    const hold = prepareOfficialChart(fixture()).lines[0]?.notes[1];
    expect(hold?.kind).toBe(2);
    expect(hold?.holdEndTick).toBe(3);
    expect(hold?.holdEndCanvasIndex).toBe(0);
    expect(hold?.holdEndFloorPosition).toBe(3);
  });

  it('chartDelayMs is applied as seconds', () => {
    const chart = prepareOfficialChart(fixture({ chartDelayMs: 250, offset: 0.1 }));
    expect(chart.delaySeconds).toBe(0.35);
  });

  it('theme stores fx color from colorsList[2]', () => {
    const chart = prepareOfficialChart(fixture({
      themes: [{ colorsList: [
        { r: 10, g: 20, b: 30, a: 255 },
        { r: 40, g: 50, b: 60, a: 255 },
        { r: 70, g: 80, b: 90, a: 255 },
      ] }],
    }));
    expect(chart.themes[0]?.fx).toEqual({ r: 70, g: 80, b: 90, a: 255 });
  });

  it('visual speed uses 6.71875 + user speed', () => {
    expect(visualSpeed(3.5)).toBe(10.21875);
    expect(visualSpeed(0)).toBe(6.71875);
    expect(visualSpeed(20)).toBe(26.71875);
  });

  it('user speed can exceed the in-game cap of 10', () => {
    expect(clampUserSpeed(10)).toBe(10);
    expect(clampUserSpeed(20)).toBe(20);
    expect(clampUserSpeed(20.1)).toBe(20);
  });

  it('easeType 0/1/2/13/14 and unknown stay on the unit interval', () => {
    expect(applyEase(0, 0.25)).toBe(0.25);
    expect(applyEase(1, 0.5)).toBe(0.25);
    expect(applyEase(2, 0.5)).toBe(0.75);
    expect(applyEase(13, 0.8)).toBe(0);
    expect(applyEase(14, 0.2)).toBe(1);
    expect(applyEase(99, 0.4)).toBe(0.4);
    expect(applyEase(0, Number.NaN)).toBe(0);
  });

  it('layout goldens match synthetic and published charts', async () => {
    const goldens = JSON.parse(await readFile(resolve(fixtures, 'layout-goldens.json'), 'utf8')) as {
      synthetic: GoldenChart;
      pastelLinesIn: GoldenChart;
      gleamIn: GoldenChart;
    };
    const synthetic = JSON.parse(await readFile(resolve(fixtures, 'synthetic-chart.json'), 'utf8'));
    const pastel = JSON.parse(await readFile(resolve(fixtures, 'pastel-lines-in.json'), 'utf8'));
    const gleam = JSON.parse(await readFile(resolve(fixtures, 'gleam-in.json'), 'utf8'));
    assertMatchesGolden(synthetic, goldens.synthetic, true);
    assertMatchesGolden(pastel, goldens.pastelLinesIn, false);
    assertMatchesGolden(gleam, goldens.gleamIn, false);
  });
});
