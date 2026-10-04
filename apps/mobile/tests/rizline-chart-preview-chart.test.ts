import { describe, expect, it } from 'vitest';
import { applyEase } from '@/features/rizline-chart-preview/webview-player/easing';
import { prepareOfficialChart } from '@/features/rizline-chart-preview/webview-player/chart-prepare';
import { layoutPreviewFrame } from '@/features/rizline-chart-preview/webview-player/frame-layout';
import { clampUserSpeed, visualSpeed } from '@/features/rizline-chart-preview/configuration';

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

describe('Rizline official chart prepare', () => {
  it('samples camera and colour tracks across forward and backward seeks', () => {
    const chart = prepareOfficialChart(fixture());
    const values = Array.from({ length: 4 }, (_, i) => ({
      startTick: i, endTick: i + 1, startSeconds: i, endSeconds: i + 1,
      from: i + 1, to: i + 2, easeType: 0, floorPosition: i,
    }));
    chart.camera.scaleSpans = values;
    chart.camera.xSpans = values;
    chart.canvases[0]!.xSpans = values;
    chart.canvases[0]!.speedSpans = values;
    chart.lines[0]!.judgeRing = values.map((_, i) => ({
      startSeconds: i, endSeconds: i + 1,
      from: { r: i, g: 0, b: 0, a: 255 }, to: { r: i + 1, g: 0, b: 0, a: 255 },
    }));
    for (const [time, scale, red] of [[3.5, 4.5, 3.5], [1.25, 2.25, 1.25], [0, 1, 0], [4, 5, 4], [-1, 1, 0]]) {
      const frame = layoutPreviewFrame(chart, time!);
      expect(frame.cameraScale).toBe(scale);
      expect(frame.judgeRings[0]!.r).toBe(red);
    }
  });
  it('keeps holds and hit effects visible during negative scroll and reverse seeks', () => {
    const chart = prepareOfficialChart(fixture());
    const line = chart.lines[0]!;
    const template = line.notes[0]!;
    line.notes = [
      { ...template, id: 0, seconds: 2, floorPosition: 3 },
      { ...template, id: 1, seconds: 20, floorPosition: 300 },
      { ...template, id: 2, kind: 2, seconds: 0, floorPosition: -100, holdEndSeconds: 50, holdEndFloorPosition: 1000, holdEndCanvasIndex: 0 },
      { ...template, id: 3, seconds: 30, floorPosition: -8 },
    ];
    chart.canvases[0]!.speedSpans[0]!.from = -1;
    const viewport = { height: 100, judgeLineY: 75, scrollUnit: 1, visualSpeed: 1, noteRadius: 2 };
    for (const [time, ids] of [[0, [2, 0, 30]], [2.5, [2, 0, 30]], [10, [0, 30]], [2.5, [2, 0, 30]]] as const) {
      expect(layoutPreviewFrame(chart, time, viewport).notes.map(note => note.seconds)).toEqual(ids);
    }
  });
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
});
