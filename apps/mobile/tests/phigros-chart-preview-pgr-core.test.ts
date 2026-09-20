import { describe, expect, it } from 'vitest';
import {
  findEventIndex,
  lowerBoundNotes,
  parsePgrChart,
  sampleHeight,
  sampleMove,
  sampleTween,
  ticksToSeconds,
} from '@/features/phigros-chart-preview/webview-player/pgr-core';
import {
  buildHitSoundEvents,
  findHitSoundCursor,
  HIT_SOUND_LOOKAHEAD_SECONDS,
  hitSoundScheduleDelay,
} from '@/features/phigros-chart-preview/webview-player/hit-sound';

type RawLine = {
  bpm: number;
  speedEvents: { startTime: number; endTime: number; value: number }[];
  judgeLineDisappearEvents: { startTime: number; endTime: number; start: number; end: number }[];
  judgeLineRotateEvents: { startTime: number; endTime: number; start: number; end: number }[];
  judgeLineMoveEvents: { startTime: number; endTime: number; start: number; start2: number; end: number; end2: number }[];
  notesAbove: Record<string, unknown>[];
  notesBelow: Record<string, unknown>[];
};

function line(overrides: Partial<RawLine> = {}): RawLine {
  return {
    bpm: 120,
    speedEvents: [{ startTime: 0, endTime: 64, value: 1 }, { startTime: 64, endTime: 128, value: 2 }],
    judgeLineDisappearEvents: [{ startTime: 0, endTime: 64, start: 0, end: 1 }],
    judgeLineRotateEvents: [{ startTime: 0, endTime: 64, start: 0, end: 90 }],
    judgeLineMoveEvents: [{ startTime: 0, endTime: 64, start: 0.25, start2: 0.5, end: 0.75, end2: 1 }],
    notesAbove: [],
    notesBelow: [],
    ...overrides,
  };
}

describe('phigros chart preview pgr core', () => {
  it('tick 时间按 60 / (32 * bpm) 换算', () => {
    expect(ticksToSeconds(64, 120)).toBe(1);
    expect(ticksToSeconds(32, 60)).toBe(1);
    expect(() => ticksToSeconds(1, 0)).toThrow(/BPM/);
  });

  it('事件插值、移动插值和前后跳转索引稳定', () => {
    const tweens: [number, number, number, number][] = [[0, 2, 10, 30], [2, 4, 30, 50]];
    expect(sampleTween(tweens, 1)).toBe(20);
    expect(sampleTween(tweens, 3)).toBe(40);
    expect(findEventIndex(tweens, 3.5)).toBe(1);
    expect(findEventIndex(tweens, 0.5)).toBe(0);
    expect(sampleMove([[0, 2, -1, -1, 1, 1]], 1)).toEqual([0, 0]);
  });

  it('速度事件预积分可求任意时刻高度', () => {
    const chart = parsePgrChart({
      formatVersion: 3,
      offset: 0,
      judgeLineList: [line({ notesAbove: [{ type: 1, time: 128, positionX: 0, holdTime: 0, speed: 1 }] })],
    });
    const speeds = chart.lines[0]!.speedEvents;
    const firstSecond = 1 / 0.83175;
    expect(Math.abs(sampleHeight(speeds, 1) - firstSecond)).toBeLessThan(1e-9);
    expect(Math.abs(sampleHeight(speeds, 1.5) - (firstSecond + 1 / 0.83175))).toBeLessThan(1e-9);
  });

  it('四类音符、Hold 结束高度、上下侧与跨判定线双押被规范化', () => {
    const chart = parsePgrChart({
      formatVersion: 3,
      offset: 0.125,
      judgeLineList: [
        line({
          notesAbove: [
            { type: 1, time: 64, positionX: -2, holdTime: 0, speed: 1, floorPosition: 0 },
            { type: 2, time: 80, positionX: 0, holdTime: 0, speed: 1.2, floorPosition: 0 },
            { type: 3, time: 96, positionX: 2, holdTime: 32, speed: 4, floorPosition: 0 },
            { type: 4, time: 112, positionX: 3, holdTime: 0, speed: 0.9, floorPosition: 0 },
          ],
          notesBelow: [{ type: 1, time: 48, positionX: 1, holdTime: 0, speed: 1, floorPosition: 0 }],
        }),
        line({ notesBelow: [{ type: 1, time: 64, positionX: 0, holdTime: 0, speed: 1, floorPosition: 0 }] }),
      ],
    });
    expect(chart.stats.kindCounts).toEqual({ tap: 3, drag: 1, hold: 1, flick: 1 });
    expect(chart.offset).toBe(0.125);
    const firstLine = chart.lines[0]!;
    expect(firstLine.notes.some((note) => note.above === false)).toBe(true);
    const hold = firstLine.notes.find((note) => note.kind === 'hold')!;
    expect(hold.endTime).toBeGreaterThan(hold.time);
    expect(hold.endHeight).toBeGreaterThan(hold.height);
    expect(hold.speed).toBe(1);
    expect(firstLine.notes.find((note) => note.time === 1)!.multipleHint).toBe(true);
    expect(chart.lines[1]!.notes[0]!.multipleHint).toBe(true);
  });

  it('音符二分窗口在向前和向后跳转后均返回正确起点', () => {
    const notes = [{ time: 1 }, { time: 2 }, { time: 4 }, { time: 8 }];
    expect(lowerBoundNotes(notes, 3)).toBe(2);
    expect(lowerBoundNotes(notes, 0)).toBe(0);
    expect(lowerBoundNotes(notes, 8)).toBe(3);
  });

  it('未知 PGR 版本和未知音符类型会明确失败', () => {
    expect(() => parsePgrChart({ formatVersion: 2, offset: 0, judgeLineList: [line()] })).toThrow(/不支持/);
    expect(() => parsePgrChart({
      formatVersion: 3,
      offset: 0,
      judgeLineList: [line({ notesAbove: [{ type: 9, time: 0, positionX: 0, speed: 1, holdTime: 0 }] })],
    })).toThrow(/未知音符类型/);
  });

  it('时间倒序事件按 prpr 忽略，不中断整谱', () => {
    const chart = parsePgrChart({
      formatVersion: 3,
      offset: 0,
      judgeLineList: [line({
        speedEvents: [
          { startTime: 0, endTime: 64, value: 1 },
          { startTime: 80, endTime: 16, value: 9 },
          { startTime: 64, endTime: 128, value: 2 },
        ],
        judgeLineDisappearEvents: [
          { startTime: 0, endTime: 64, start: 1, end: 1 },
          { startTime: 912, endTime: 896, start: 0, end: 0 },
          { startTime: 64, endTime: 128, start: 1, end: 0 },
        ],
        judgeLineRotateEvents: [
          { startTime: 0, endTime: 64, start: 0, end: 90 },
          { startTime: 128, endTime: 32, start: 90, end: 0 },
        ],
        judgeLineMoveEvents: [
          { startTime: 0, endTime: 64, start: 0.25, start2: 0.5, end: 0.75, end2: 1 },
          { startTime: 80, endTime: 16, start: 0, start2: 0, end: 1, end2: 1 },
        ],
        notesAbove: [{ type: 1, time: 64, positionX: 0, holdTime: 0, speed: 1 }],
      })],
    });
    const parsed = chart.lines[0]!;
    expect(parsed.disappearEvents).toHaveLength(2);
    expect(parsed.rotateEvents).toHaveLength(1);
    expect(parsed.moveEvents).toHaveLength(1);
    expect(parsed.speedEvents[0]![2]).toBe(1);
    expect(parsed.notes).toHaveLength(1);
  });

  it('速度事件全部时间倒序时仍报缺失', () => {
    expect(() => parsePgrChart({
      formatVersion: 3,
      offset: 0,
      judgeLineList: [line({ speedEvents: [{ startTime: 64, endTime: 0, value: 1 }] })],
    })).toThrow(/速度事件缺失/);
  });

  it('字段无效的单条事件和缺失数组不中断整谱', () => {
    const chart = parsePgrChart({
      formatVersion: 3,
      offset: 0,
      judgeLineList: [{
        bpm: 120,
        speedEvents: [
          { startTime: 0, endTime: 64, value: 1 },
          { startTime: 64, endTime: 128, value: Number.NaN },
          { startTime: 64, endTime: 128, value: 2 },
        ],
        judgeLineDisappearEvents: [
          { startTime: 0, endTime: 64, start: 1, end: 1 },
          { startTime: 64, endTime: 128, start: Number.NaN, end: 0 },
        ],
        judgeLineRotateEvents: null,
        judgeLineMoveEvents: [
          { startTime: 0, endTime: 64, start: 0.25, start2: Number.NaN, end: 0.75, end2: 'x' },
          { startTime: 'bad', endTime: 128, start: 0, end: 1 },
        ],
        notesAbove: [{ type: 1, time: 64, positionX: 0, holdTime: 0, speed: 1 }],
      }],
    });
    const parsed = chart.lines[0]!;
    expect(parsed.disappearEvents).toHaveLength(1);
    expect(parsed.rotateEvents).toHaveLength(0);
    expect(parsed.moveEvents).toHaveLength(1);
    expect(parsed.moveEvents[0]!.slice(2)).toEqual([-0.5, -1, 0.5, -1]);
    expect(parsed.notes).toHaveLength(1);
  });
});

describe('phigros chart preview hit sounds', () => {
  it('打击音时间轴为每个音符只建立一次事件且 Hold 只触发 click 头音', () => {
    const chart = {
      lines: [
        { notes: [
          { kind: 'tap', time: 1 },
          { kind: 'hold', time: 2, endTime: 8 },
          { kind: 'drag', time: 3 },
        ] },
        { notes: [{ kind: 'flick', time: 3 }] },
      ],
    };
    const events = buildHitSoundEvents(chart);
    expect(events.map(({ time, sound, noteKind }) => ({ time, sound, noteKind }))).toEqual([
      { time: 1, sound: 'click', noteKind: 'tap' },
      { time: 2, sound: 'click', noteKind: 'hold' },
      { time: 3, sound: 'drag', noteKind: 'drag' },
      { time: 3, sound: 'flick', noteKind: 'flick' },
    ]);
    expect(events.filter((event) => event.noteKind === 'hold')).toHaveLength(1);
    expect(findHitSoundCursor(events, 2)).toBe(2);
    expect(findHitSoundCursor(events, 0)).toBe(0);
  });

  it('打击音提前量按谱面时间和倍速换算为 Web Audio 调度延迟', () => {
    expect(HIT_SOUND_LOOKAHEAD_SECONDS).toBe(1.5);
    expect(Math.abs(hitSoundScheduleDelay(10.12, 10, 1) - 0.12)).toBeLessThan(1e-12);
    expect(Math.abs(hitSoundScheduleDelay(10.12, 10, 2) - 0.06)).toBeLessThan(1e-12);
    expect(hitSoundScheduleDelay(9.9, 10, 1)).toBe(0);
    expect(() => hitSoundScheduleDelay(1, 0, 0)).toThrow(/播放倍速/);
  });
});
