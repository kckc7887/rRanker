/**
 * PGR 谱面解析与时间轴语义移植自 demo/phigros-chart-preview/pgr-core.js，
 * 语义依据 refer/phira/prpr 的 PGR 解析行为重新编写。
 * 该模块保持纯函数、不依赖 DOM，供 WebView 播放器与 Vitest 共用。
 *
 * 许可证：解析语义衍生自 TeamFlos/phira（GPL-3.0，https://github.com/TeamFlos/phira），
 * 相应部分按 GPL-3.0 随本项目（AGPL-3.0）一并发布，两者兼容；来源与许可证全文见仓库根 THIRD_PARTY_NOTICES.md。
 */

export const PGR_HEIGHT_RATIO = 0.83175;

const NOTE_KINDS: Readonly<Record<number, PgrNoteKind>> = Object.freeze({ 1: 'tap', 2: 'drag', 3: 'hold', 4: 'flick' });

export type PgrNoteKind = 'tap' | 'drag' | 'hold' | 'flick';

export type PgrTweenEvent = [number, number, number, number];
export type PgrMoveEvent = [number, number, number, number, number, number];
export type PgrHeightEvent = [number, number, number, number, number];

export interface PgrNote {
  kind: PgrNoteKind;
  time: number;
  endTime: number;
  positionX: number;
  speed: number;
  height: number;
  endHeight: number;
  above: boolean;
  multipleHint: boolean;
}

export interface PgrLine {
  bpm: number;
  speedEvents: PgrHeightEvent[];
  disappearEvents: PgrTweenEvent[];
  rotateEvents: PgrTweenEvent[];
  moveEvents: PgrMoveEvent[];
  notes: PgrNote[];
  maxHoldDuration: number;
}

export interface PgrChart {
  formatVersion: number;
  offset: number;
  lines: PgrLine[];
  stats: {
    lineCount: number;
    noteCount: number;
    eventCount: number;
    maxTime: number;
    kindCounts: Record<PgrNoteKind, number>;
  };
}

type RawTween = { startTime: unknown; endTime: unknown; start: unknown; end: unknown };
type RawMove = RawTween & { start2?: unknown; end2?: unknown };
type RawSpeed = { startTime: unknown; endTime: unknown; value: unknown };
type RawNote = { type: unknown; time: unknown; holdTime?: unknown; positionX: unknown; speed?: unknown };
type RawLine = {
  bpm: unknown;
  speedEvents: RawSpeed[];
  judgeLineDisappearEvents: RawTween[];
  judgeLineRotateEvents: RawTween[];
  judgeLineMoveEvents: RawMove[];
  notesAbove: RawNote[];
  notesBelow: RawNote[];
};
type RawChart = {
  formatVersion: unknown;
  offset?: unknown;
  judgeLineList: RawLine[];
};

function finiteNumber(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label} 不是有限数值`);
  return number;
}

export function ticksToSeconds(ticks: unknown, bpm: unknown): number {
  const safeBpm = finiteNumber(bpm, 'BPM');
  if (safeBpm <= 0) throw new Error('BPM 必须大于 0');
  return finiteNumber(ticks, '谱面时间') * 60 / (32 * safeBpm);
}

function normalizeTweenEvents(
  source: RawTween[],
  bpm: number,
  label: string,
  transform: (value: number) => number = (value) => value,
): PgrTweenEvent[] {
  if (!Array.isArray(source)) throw new Error(`${label} 缺失`);
  const events = source.map((raw, index) => {
    const startTime = ticksToSeconds(raw.startTime, bpm);
    const endTime = ticksToSeconds(raw.endTime, bpm);
    if (startTime > endTime) throw new Error(`${label}[${index}] 起始时间晚于结束时间`);
    return [
      startTime,
      endTime,
      transform(finiteNumber(raw.start, `${label}[${index}].start`)),
      transform(finiteNumber(raw.end, `${label}[${index}].end`)),
    ] as PgrTweenEvent;
  });
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return events;
}

function normalizeMoveEvents(source: RawMove[], bpm: number, formatVersion: number): PgrMoveEvent[] {
  if (!Array.isArray(source)) throw new Error('判定线移动事件缺失');
  return source.map((raw, index) => {
    const startTime = ticksToSeconds(raw.startTime, bpm);
    const endTime = ticksToSeconds(raw.endTime, bpm);
    if (startTime > endTime) throw new Error(`移动事件[${index}] 起始时间晚于结束时间`);
    let startX = finiteNumber(raw.start, `移动事件[${index}].start`);
    let endX = finiteNumber(raw.end, `移动事件[${index}].end`);
    let startY = finiteNumber(raw.start2 ?? 0, `移动事件[${index}].start2`);
    let endY = finiteNumber(raw.end2 ?? 0, `移动事件[${index}].end2`);
    if (formatVersion === 1) {
      const sx = Math.trunc(startX / 1000);
      const sy = startX % 1000;
      const ex = Math.trunc(endX / 1000);
      const ey = endX % 1000;
      startX = (-880 + sx * 2) / 880;
      startY = (-520 + sy * 2) / 520;
      endX = (-880 + ex * 2) / 880;
      endY = (-520 + ey * 2) / 520;
    } else {
      startX = -1 + startX * 2;
      endX = -1 + endX * 2;
      startY = -1 + startY * 2;
      endY = -1 + endY * 2;
    }
    return [startTime, endTime, startX, startY, endX, endY] as PgrMoveEvent;
  }).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

function normalizeSpeedEvents(source: RawSpeed[], bpm: number, maxTime: number): PgrHeightEvent[] {
  if (!Array.isArray(source) || source.length === 0) throw new Error('判定线速度事件缺失');
  const rawEvents = source.map((raw, index) => {
    const startTime = ticksToSeconds(raw.startTime, bpm);
    const endTime = ticksToSeconds(raw.endTime, bpm);
    if (startTime > endTime) throw new Error(`速度事件[${index}] 起始时间晚于结束时间`);
    return [startTime, endTime, finiteNumber(raw.value, `速度事件[${index}].value`)];
  }).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (rawEvents[0][0] !== 0) rawEvents[0][0] = 0;

  const keyframes: number[][] = [];
  let height = 0;
  for (let index = 0; index < rawEvents.length - 1; index += 1) {
    const [start, end, value] = rawEvents[index];
    keyframes.push([start, height]);
    height += (end - start) * value / PGR_HEIGHT_RATIO;
  }
  const [lastStart, , lastValue] = rawEvents[rawEvents.length - 1]!;
  keyframes.push([lastStart, height]);
  keyframes.push([maxTime, height + (maxTime - lastStart) * lastValue / PGR_HEIGHT_RATIO]);
  return keyframes.slice(0, -1).map(([start, startHeight], index) => {
    const [end, endHeight] = keyframes[index + 1]!;
    const value = end === start ? 0 : (endHeight - startHeight) * PGR_HEIGHT_RATIO / (end - start);
    return [start, end, value, startHeight, endHeight] as PgrHeightEvent;
  });
}

export function findEventIndex<T extends { 0: number }>(events: readonly T[], time: number): number {
  if (!events.length) return -1;
  let low = 0;
  let high = events.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (events[middle][0] <= time) low = middle + 1;
    else high = middle;
  }
  return Math.max(0, low - 1);
}

export function sampleTween(events: PgrTweenEvent[], time: number, fallback = 0): number {
  if (!events.length) return fallback;
  const event = events[findEventIndex(events, time)]!;
  if (time <= event[0]) return event[2];
  if (time >= event[1] || event[1] === event[0]) return event[3];
  const progress = (time - event[0]) / (event[1] - event[0]);
  return event[2] + (event[3] - event[2]) * progress;
}

export function sampleMove(events: PgrMoveEvent[], time: number): [number, number] {
  if (!events.length) return [0, 0];
  const event = events[findEventIndex(events, time)]!;
  if (time <= event[0]) return [event[2], event[3]];
  if (time >= event[1] || event[1] === event[0]) return [event[4], event[5]];
  const progress = (time - event[0]) / (event[1] - event[0]);
  return [event[2] + (event[4] - event[2]) * progress, event[3] + (event[5] - event[3]) * progress];
}

export function sampleHeight(events: PgrHeightEvent[], time: number): number {
  if (!events.length) return 0;
  const index = findEventIndex(events, time);
  const event = events[index]!;
  if (time <= event[0]) return event[3];
  if (time <= event[1]) return event[3] + (time - event[0]) * event[2] / PGR_HEIGHT_RATIO;
  if (index === events.length - 1) return event[4];
  return event[4];
}

export function lowerBoundNotes<T extends { time: number }>(notes: readonly T[], time: number): number {
  let low = 0;
  let high = notes.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (notes[middle]!.time < time) low = middle + 1;
    else high = middle;
  }
  return low;
}

function normalizeNotes(
  source: RawNote[],
  bpm: number,
  above: boolean,
  speedEvents: PgrHeightEvent[],
  lineIndex: number,
): PgrNote[] {
  if (!Array.isArray(source)) throw new Error(`判定线 ${lineIndex} 音符列表缺失`);
  return source.map((raw, noteIndex) => {
    const type = finiteNumber(raw.type, `判定线 ${lineIndex} 音符 ${noteIndex} 类型`);
    const kind = NOTE_KINDS[type];
    if (!kind) throw new Error(`判定线 ${lineIndex} 存在未知音符类型 ${type}`);
    const time = ticksToSeconds(raw.time, bpm);
    const holdTime = type === 3 ? ticksToSeconds(raw.holdTime, bpm) : 0;
    const endTime = time + holdTime;
    return {
      kind,
      time,
      endTime,
      positionX: finiteNumber(raw.positionX, `判定线 ${lineIndex} 音符 ${noteIndex} positionX`),
      speed: type === 3 ? 1 : finiteNumber(raw.speed, `判定线 ${lineIndex} 音符 ${noteIndex} speed`),
      height: sampleHeight(speedEvents, time),
      endHeight: sampleHeight(speedEvents, endTime),
      above,
      multipleHint: false,
    };
  });
}

function markMultipleHints(lines: PgrLine[]): void {
  const counts = new Map<string, number>();
  for (const line of lines) {
    for (const note of line.notes) {
      const key = note.time.toFixed(9);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  for (const line of lines) {
    for (const note of line.notes) note.multipleHint = (counts.get(note.time.toFixed(9)) ?? 0) >= 2;
  }
}

export function parsePgrChart(source: string | unknown): PgrChart {
  const raw = (typeof source === 'string' ? JSON.parse(source) : source) as RawChart;
  if (!raw || typeof raw !== 'object') throw new Error('PGR 根节点不是对象');
  const formatVersion = finiteNumber(raw.formatVersion, 'formatVersion');
  if (formatVersion !== 1 && formatVersion !== 3) throw new Error(`不支持 PGR formatVersion ${formatVersion}`);
  if (!Array.isArray(raw.judgeLineList) || raw.judgeLineList.length === 0) throw new Error('judgeLineList 缺失');

  const maxHeadTime = raw.judgeLineList.reduce((maximum, line) => {
    const bpm = finiteNumber(line.bpm, '判定线 BPM');
    const notes = [...(line.notesAbove ?? []), ...(line.notesBelow ?? [])];
    return notes.reduce((lineMaximum, note) => Math.max(lineMaximum, ticksToSeconds(note.time, bpm)), maximum);
  }, 0);
  const heightTimelineEnd = maxHeadTime + 1;
  let noteCount = 0;
  let eventCount = 0;
  let maxTime = 0;
  const kindCounts: Record<PgrNoteKind, number> = { tap: 0, drag: 0, hold: 0, flick: 0 };
  const lines = raw.judgeLineList.map((line, lineIndex): PgrLine => {
    const bpm = finiteNumber(line.bpm, `判定线 ${lineIndex} BPM`);
    const rawEventCount = line.speedEvents.length + line.judgeLineDisappearEvents.length
      + line.judgeLineRotateEvents.length + line.judgeLineMoveEvents.length;
    const speedEvents = normalizeSpeedEvents(line.speedEvents, bpm, heightTimelineEnd);
    const disappearEvents = normalizeTweenEvents(line.judgeLineDisappearEvents, bpm, '透明度事件');
    const rotateEvents = normalizeTweenEvents(line.judgeLineRotateEvents, bpm, '旋转事件');
    const moveEvents = normalizeMoveEvents(line.judgeLineMoveEvents, bpm, formatVersion);
    const notes = [
      ...normalizeNotes(line.notesAbove, bpm, true, speedEvents, lineIndex),
      ...normalizeNotes(line.notesBelow, bpm, false, speedEvents, lineIndex),
    ].sort((a, b) => a.time - b.time || a.positionX - b.positionX);
    let maxHoldDuration = 0;
    for (const note of notes) {
      kindCounts[note.kind] += 1;
      maxTime = Math.max(maxTime, note.endTime);
      maxHoldDuration = Math.max(maxHoldDuration, note.endTime - note.time);
    }
    noteCount += notes.length;
    eventCount += rawEventCount;
    return { bpm, speedEvents, disappearEvents, rotateEvents, moveEvents, notes, maxHoldDuration };
  });
  markMultipleHints(lines);

  return {
    formatVersion,
    offset: finiteNumber(raw.offset ?? 0, 'offset'),
    lines,
    stats: { lineCount: lines.length, noteCount, eventCount, maxTime, kindCounts },
  };
}
