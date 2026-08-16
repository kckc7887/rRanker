/**
 * RPE（Re:PhiEdit）谱面解析与缓动/速度积分，逐语义移植自 demo/phira-rpe-chart-preview/rpe-core.js，
 * 语义对照 refer/player-main（utils.ts/Line.ts/Game.ts）与 refer/phira/prpr（RPE 路径）：
 * - easingType 1..29 直接索引缓动表（prpr RPE_TWEEN_MAP 语义，29 号为真实 elasticInOut）；
 * - 速度高度 = 事件内积分 + 事件结束后恒定 end 速度延伸（getIntegral 语义）；
 * - 多事件层相加；extra.json 的 bpm 覆盖谱面 BPMList；负 alpha 保留（渲染层按 prpr 整线隐藏）；
 * - 事件值可为数值/数组/字符串（文本事件），数组逐分量插值。
 *
 * 许可证：本文件语义对照 PhiZone/player（MPL-2.0，https://github.com/PhiZone/player）与
 * TeamFlos/phira（GPL-3.0，https://github.com/TeamFlos/phira）移植，相应部分按各自原许可提供
 * （与本项目 AGPL-3.0 兼容）；来源与许可证全文见仓库根 THIRD_PARTY_NOTICES.md。
 */

export const RPE_WIDTH = 1350;
export const RPE_HEIGHT = 900;

// ---------------- 缓动（prpr RPE_TWEEN_MAP 语义） ----------------
const sineIn = (x: number): number => Math.sin((x * Math.PI) / 2);
const sineOut = (x: number): number => 1 - Math.cos((x * Math.PI) / 2);
const quadOut = (x: number): number => 1 - (1 - x) * (1 - x);
const quadIn = (x: number): number => x * x;
const sineInOut = (x: number): number => -(Math.cos(Math.PI * x) - 1) / 2;
const quadInOut = (x: number): number => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
const cubicOut = (x: number): number => 1 - Math.pow(1 - x, 3);
const cubicIn = (x: number): number => x * x * x;
const quartOut = (x: number): number => 1 - Math.pow(1 - x, 4);
const quartIn = (x: number): number => x * x * x * x;
const cubicInOut = (x: number): number => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const quartInOut = (x: number): number => (x < 0.5 ? 8 * x * x * x * x : 1 - Math.pow(-2 * x + 2, 4) / 2);
const quintOut = (x: number): number => 1 - Math.pow(1 - x, 5);
const quintIn = (x: number): number => x * x * x * x * x;
const expoOut = (x: number): number => (x === 1 ? 1 : 1 - Math.pow(2, -10 * x));
const expoIn = (x: number): number => (x === 0 ? 0 : Math.pow(2, 10 * x - 10));
const circOut = (x: number): number => Math.sqrt(1 - Math.pow(x - 1, 2));
const circIn = (x: number): number => 1 - Math.sqrt(1 - Math.pow(x, 2));
const backOut = (x: number): number => 1 + 2.70158 * Math.pow(x - 1, 3) + 1.70158 * Math.pow(x - 1, 2);
const backIn = (x: number): number => 2.70158 * x * x * x - 1.70158 * x * x;
const circInOut = (x: number): number =>
  x < 0.5
    ? (1 - Math.sqrt(1 - Math.pow(2 * x, 2))) / 2
    : (Math.sqrt(1 - Math.pow(-2 * x + 2, 2)) + 1) / 2;
const backInOut = (x: number): number =>
  x < 0.5
    ? (Math.pow(2 * x, 2) * ((2.59491 + 1) * 2 * x - 2.59491)) / 2
    : (Math.pow(2 * x - 2, 2) * ((2.59491 + 1) * (x * 2 - 2) + 2.59491) + 2) / 2;
const elasticOut = (x: number): number =>
  x === 0 ? 0 : x === 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
const elasticIn = (x: number): number =>
  x === 0 ? 0 : x === 1 ? 1 : -Math.pow(2, 10 * x - 10) * Math.sin((x * 10 - 10.75) * ((2 * Math.PI) / 3));
const bounceOut = (x: number): number =>
  x < 1 / 2.75 ? 7.5625 * x * x
    : x < 2 / 2.75 ? 7.5625 * (x -= 1.5 / 2.75) * x + 0.75
      : x < 2.5 / 2.75 ? 7.5625 * (x -= 2.25 / 2.75) * x + 0.9375
        : 7.5625 * (x -= 2.625 / 2.75) * x + 0.984375;
const bounceIn = (x: number): number => 1 - bounceOut(1 - x);
const bounceInOut = (x: number): number => (x < 0.5 ? (1 - bounceOut(1 - 2 * x)) / 2 : (1 + bounceOut(2 * x - 1)) / 2);
// prpr core/tween.rs：29 号是真实的 elasticInOut（player-main 用 bounceInOut 顶替，此处按 prpr）
const elasticInOut = (x: number): number => {
  if (x === 0 || x === 1) return x;
  const t = x * 2;
  if (t < 1) {
    return -0.5 * Math.pow(2, 10 * (t - 1)) * Math.sin((t - 1.1) * 5 * Math.PI);
  }
  return 0.5 * Math.pow(2, -10 * (t - 1)) * Math.sin((t - 1.1) * 5 * Math.PI) + 1;
};

/** easingType 1..29 直接索引（index 0 = type 1，prpr RPE_TWEEN_MAP 语义） */
const EASINGS: readonly ((x: number) => number)[] = [
  (x) => x, sineIn, sineOut, quadOut, quadIn, sineInOut, quadInOut,
  cubicOut, cubicIn, quartOut, quartIn, cubicInOut, quartInOut,
  quintOut, quintIn, expoOut, expoIn, circOut, circIn,
  backOut, backIn, circInOut, backInOut, elasticOut, elasticIn,
  bounceOut, bounceIn, bounceInOut, elasticInOut,
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

interface EasingParams {
  type: number;
  x: number;
  easingLeft: number;
  easingRight: number;
}

function sanitizeEasingParams(type: number, x: number, easingLeft: number, easingRight: number): EasingParams {
  return {
    type: type > 0 && type <= EASINGS.length ? type : 1,
    x: !x ? 0 : clamp(x, 0, 1),
    easingLeft: !easingLeft || easingLeft >= easingRight ? 0 : clamp(easingLeft, 0, 1),
    easingRight: !easingRight || easingLeft >= easingRight ? 1 : clamp(easingRight, 0, 1),
  };
}

function calculateEasingValue(func: (x: number) => number, x: number, easingLeft = 0, easingRight = 1): number {
  const progress = func(easingLeft + (easingRight - easingLeft) * x);
  const progressStart = func(easingLeft);
  const progressEnd = func(easingRight);
  return (progress - progressStart) / (progressEnd - progressStart);
}

/** cubic-bezier 缓动（gre/bezier-easing 语义） */
function bezierEasing(x1: number, y1: number, x2: number, y2: number): (x: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (t: number): number => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number): number => ((ay * t + by) * t + cy) * t;
  const derivX = (t: number): number => (3 * ax * t + 2 * bx) * t + cx;
  const solve = (x: number): number => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i += 1) {
      const slope = derivX(t);
      if (slope < 1e-6) break;
      t -= (sampleX(t) - x) / slope;
    }
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 16; i += 1) {
      const mid = (lo + hi) / 2;
      if (sampleX(mid) < x) lo = mid;
      else hi = mid;
    }
    return t;
  };
  return (x) => sampleY(solve(x));
}

/** 事件缓动进度（player-main easing()） */
export function easing(
  type: number,
  bezierPoints: number[] | undefined,
  x: number,
  easingLeft = 0,
  easingRight = 1,
): number {
  const p = sanitizeEasingParams(type, x, easingLeft, easingRight);
  const useBezier = !!bezierPoints && bezierPoints.length >= 4;
  const func = useBezier ? bezierEasing(bezierPoints[0]!, bezierPoints[1]!, bezierPoints[2]!, bezierPoints[3]!) : EASINGS[p.type - 1]!;
  return calculateEasingValue(func, p.x, useBezier ? 0 : p.easingLeft, useBezier ? 1 : p.easingRight);
}

function derivative(type: number, x: number, easingLeft = 0, easingRight = 1): number {
  const p = sanitizeEasingParams(type, x, easingLeft, easingRight);
  if ((p.x === 0 || p.x === 1) && p.easingLeft === 0 && p.easingRight === 1) {
    const func = EASINGS[p.type - 1]!;
    if (p.x === 0) return (func(1e-12) - func(0)) / 1e-12;
    return (func(1) - func(1 - 1e-12)) / 1e-12;
  }
  const epsilon = 1e-12;
  const leftX = Math.max(1e-16, p.x - epsilon);
  const rightX = Math.min(1 - 1e-16, p.x + epsilon);
  return (
    (calculateEasingValue(EASINGS[p.type - 1]!, rightX, p.easingLeft, p.easingRight) -
      calculateEasingValue(EASINGS[p.type - 1]!, leftX, p.easingLeft, p.easingRight)) /
    (rightX - leftX)
  );
}

/** 现代积分缓动的数值积分（Gauss，替代 player-main 的解析积分表） */
function calculateEasingIntegral(type: number, x: number, easingLeft = 0, easingRight = 1): number {
  const p = sanitizeEasingParams(type, x, easingLeft, easingRight);
  const func = EASINGS[p.type - 1]!;
  const l = p.easingLeft;
  const r = p.easingRight;
  const denom = func(r) - func(l);
  if (!Number.isFinite(denom) || Math.abs(denom) < 1e-15) return (p.x * p.x) / 2;
  const nodes = [-0.7745966692, 0, 0.7745966692];
  const weights = [5 / 9, 8 / 9, 5 / 9];
  const radius = p.x / 2;
  let sum = 0;
  for (let i = 0; i < 3; i += 1) sum += weights[i]! * calculateEasingValue(func, radius * (nodes[i]! + 1), l, r);
  return (radius * sum) / (r - l);
}

// ---------------- 类型 ----------------
export type RpeTriple = [number, number, number] | number;
export type RpeEventValue = number | number[] | string;
export type RpeNoteKind = 'tap' | 'hold' | 'flick' | 'drag';

export interface RpeEvent {
  startBeat: number;
  endBeat: number;
  start: RpeEventValue;
  end: RpeEventValue;
  easingType: number;
  easingLeft: number;
  easingRight: number;
  bezier: number;
  bezierPoints: number[];
}

export interface RpeControlKeyframe {
  x: number;
  easing: number;
  value: number;
}

export interface RpeNote {
  kind: RpeNoteKind;
  type: number;
  positionX: number;
  yOffset: number;
  yOffsetRaw: number;
  above: boolean;
  isFake: boolean;
  alpha: number;
  visibleTime: number;
  size: number;
  speed: number;
  tint: [number, number, number] | null;
  tintHitEffects: [number, number, number] | null;
  judgeArea: number | null;
  hitTime: number;
  endHitTime: number;
  hitBeat: number;
  headHeight: number;
  tailHeight: number;
  multipleHint: boolean;
}

export interface RpeEventLayer {
  speedEvents: RpeEvent[];
  moveXEvents: RpeEvent[];
  moveYEvents: RpeEvent[];
  rotateEvents: RpeEvent[];
  alphaEvents: RpeEvent[];
}

export interface RpeLine {
  bpmfactor: number;
  isCover: number;
  zIndex: number;
  parent: number | null;
  rotWithParent: boolean;
  integrateSpeedEasings: boolean;
  eventLayers: RpeEventLayer[];
  inclineEvents: RpeEvent[];
  scaleXEvents: RpeEvent[];
  scaleYEvents: RpeEvent[];
  textEvents: RpeEvent[];
  colorEvents: RpeEvent[];
  gifEvents: RpeEvent[];
  paintEvents: RpeEvent[];
  attachUI: number | null;
  alphaControl: RpeControlKeyframe[];
  posControl: RpeControlKeyframe[];
  sizeControl: RpeControlKeyframe[];
  yControl: RpeControlKeyframe[];
  texture: string;
  scaleOnNotes: number;
  anchor: [number, number];
  notes: RpeNote[];
  lineIndex: number;
}

export interface RpeVideo {
  path: string;
  time: number;
  startTimeSec: number;
  scale: string;
  alpha: RpeEventValue | RpeEvent[];
  dim: RpeEventValue | RpeEvent[];
  zIndex: number;
  attach: { line: number; [key: string]: unknown } | null;
}

export interface RpeEffect {
  shader: string;
  startBeat: number;
  endBeat: number;
  global: boolean;
  line: number;
  order: number;
  vars: Record<string, RpeEventValue | RpeEvent[]>;
}

export interface RpeExtras {
  videos: RpeVideo[];
  effects: RpeEffect[];
}

export interface RpeInfo {
  backgroundDim?: number;
  aspectRatio?: number;
  lineLength?: number;
  offset?: number;
  forceAspectRatio?: boolean;
  holdPartialCover?: boolean;
  noteUniformScale?: boolean;
  useAttachUiFix?: boolean;
  name?: string;
  level?: string;
}

export interface RpeChart {
  formatVersion: number;
  offset: number;
  bpmList: BpmList;
  lines: RpeLine[];
  background: string | null;
  extras: RpeExtras;
  info: RpeInfo;
  stats: { lineCount: number; noteCount: number; eventCount: number; maxTime: number; kindCounts: Record<RpeNoteKind, number> };
}

// ---------------- 事件值 / 速度积分（player-main getEventValue / getIntegral） ----------------
function interpolateValue(start: RpeEventValue, end: RpeEventValue, progress: number): RpeEventValue {
  // 文本事件值不做插值，直接取当前事件的 start
  if (typeof start === 'string') return start;
  if (Array.isArray(start) || Array.isArray(end)) {
    const a = Array.isArray(start) ? start : [start as number];
    const b = Array.isArray(end) ? end : [end as number];
    return a.map((v, i) => v + ((b[i] ?? v) - v) * progress);
  }
  return start + (end as number - start) * progress;
}

function getEventValueInner(event: RpeEvent, x: number): RpeEventValue {
  const progress = easing(
    event.easingType,
    event.bezier === 1 ? event.bezierPoints : undefined,
    x,
    event.easingLeft,
    event.easingRight,
  );
  if (progress === 0) return event.start;
  if (progress === 1) return event.end;
  return interpolateValue(event.start, event.end, progress);
}

/** 事件在 beat 处的值（事件区间外钳制为 start/end） */
export function getEventValue(event: RpeEvent, beat: number, bpmList: BpmList): RpeEventValue {
  const startSec = bpmList.timeSec(event.startBeat);
  const progressedSec = bpmList.timeSec(beat) - startSec;
  const lengthSec = bpmList.timeSec(event.endBeat) - startSec;
  return getEventValueInner(event, progressedSec / lengthSec);
}

function integrate(type: number, x: number, k: number, b: number, easingLeft: number, easingRight: number): number {
  const p = sanitizeEasingParams(type, x, easingLeft, easingRight);
  return k * calculateEasingValue(EASINGS[p.type - 1]!, p.x, p.easingLeft, p.easingRight) + b * p.x;
}

/**
 * 速度事件到 beat 处的积分高度（player-main getIntegral）：
 * easing<=1 梯形；>1 时 integrateEasings=false 用 k·f+b 积分、true 用归一化积分；
 * 事件结束后由调用方按恒定 end 速度延伸。
 */
export function getIntegral(
  event: RpeEvent,
  bpmList: BpmList,
  integrateEasings: boolean,
  beat?: number,
): number {
  if (!event) return 0;
  const clampedBeat = beat === undefined || beat >= event.endBeat ? event.endBeat : beat;
  const startSec = bpmList.timeSec(event.startBeat);
  const progressedSec = bpmList.timeSec(clampedBeat) - startSec;
  const lengthSec = bpmList.timeSec(event.endBeat) - startSec;
  const x = progressedSec / lengthSec;
  if (event.easingType <= 1) {
    return ((event.start as number + (getEventValueInner(event, x) as number)) * progressedSec) / 2;
  }
  const easingLeft = event.easingLeft;
  const easingRight = event.easingRight;
  if (!integrateEasings) {
    const df0 = derivative(event.easingType, 0, easingLeft, easingRight);
    const df1 = derivative(event.easingType, 1, easingLeft, easingRight);
    const k = ((event.end as number) - (event.start as number)) / (df1 - df0);
    const b = (event.start as number) - k * df0;
    return (
      (integrate(event.easingType, x, k, b, easingLeft, easingRight) * lengthSec) /
      (event.endBeat - event.startBeat)
    );
  }
  const integral = calculateEasingIntegral(event.easingType, x, easingLeft, easingRight);
  return (event.start as number) * progressedSec + ((event.end as number) - (event.start as number)) * integral * lengthSec;
}

/** 整条速度时间线在 beat 处的高度（player-main Line.handleSpeed + calculateHeight 语义） */
export function speedHeightAt(
  layers: readonly (RpeEventLayer | null | undefined)[],
  bpmList: BpmList,
  integrateEasings: boolean,
  beat: number,
): number {
  let total = 0;
  for (const layer of layers) {
    const events = layer?.speedEvents ?? [];
    if (events.length === 0) continue;
    const index = eventIndexAt(events, beat);
    let height = 0;
    for (let i = 0; i < index; i += 1) {
      const event = events[i]!;
      const next = events[i + 1]!;
      height +=
        getIntegral(event, bpmList, integrateEasings) +
        (event.end as number) * (bpmList.timeSec(next.startBeat) - bpmList.timeSec(event.endBeat));
    }
    const event = events[index]!;
    if (beat <= event.endBeat) {
      height += getIntegral(event, bpmList, integrateEasings, beat);
    } else {
      height +=
        getIntegral(event, bpmList, integrateEasings) +
        (event.end as number) * (bpmList.timeSec(beat) - bpmList.timeSec(event.endBeat));
    }
    total += height;
  }
  return total;
}

/** 最后一个 startBeat <= beat 的事件下标 */
function eventIndexAt(events: readonly RpeEvent[], beat: number): number {
  let index = 0;
  while (index < events.length - 1 && beat > events[index + 1]!.startBeat) index += 1;
  return index;
}

// ---------------- BPMList（player-main getTimeSec 语义） ----------------
interface BpmElement {
  startBeat: number;
  startTimeSec: number;
  bpm: number;
}

export class BpmList {
  private readonly elements: BpmElement[];

  constructor(ranges: readonly (readonly [number, number])[]) {
    this.elements = [];
    let time = 0;
    let lastBeats = 0;
    let lastBpm: number | null = null;
    for (const [beats, bpm] of ranges) {
      if (lastBpm !== null) time += (beats - lastBeats) * (60 / lastBpm);
      lastBeats = beats;
      lastBpm = bpm;
      this.elements.push({ startBeat: beats, startTimeSec: time, bpm });
    }
  }

  timeSec(beat: number): number {
    let bpm = this.elements[0]!;
    for (const element of this.elements) {
      if (element.startBeat <= beat) bpm = element;
      else break;
    }
    return bpm.startTimeSec + ((beat - bpm.startBeat) / bpm.bpm) * 60;
  }

  beat(timeSec: number): number {
    let bpm = this.elements[0]!;
    for (const element of this.elements) {
      if (element.startTimeSec <= timeSec) bpm = element;
      else break;
    }
    return bpm.startBeat + ((timeSec - bpm.startTimeSec) / 60) * bpm.bpm;
  }
}

function toBeats(time: RpeTriple | undefined | null): number {
  if (!Array.isArray(time)) return Number(time);
  if (time[1] === 0 || time[2] === 0) return time[0];
  return time[0] + time[1] / time[2];
}

function finite(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label} 不是有限数值`);
  return number;
}

// ---------------- 解析 ----------------
const NOTE_KINDS: Readonly<Record<number, RpeNoteKind>> = { 1: 'tap', 2: 'hold', 3: 'flick', 4: 'drag' };

interface RawRpeEvent {
  startTime?: RpeTriple;
  endTime?: RpeTriple;
  time?: RpeTriple;
  start?: RpeEventValue;
  end?: RpeEventValue;
  easingType?: number;
  easingLeft?: number;
  easingRight?: number;
  bezier?: number;
  bezierPoints?: number[];
}

function normalizeEvents(events: RawRpeEvent[] | null | undefined, lineIndex: number, kind: string): RpeEvent[] {
  const out: RpeEvent[] = (events ?? []).map((event) => {
    if (typeof event.start === 'number') finite(event.start, `判定线 ${lineIndex} ${kind} start`);
    if (typeof event.end === 'number') finite(event.end, `判定线 ${lineIndex} ${kind} end`);
    return {
      startBeat: toBeats(event.startTime ?? event.time ?? [0, 0, 1]),
      endBeat: toBeats(event.endTime ?? [9999, 0, 1]),
      // 值为数值/数组/字符串（文本事件），数组与字符串原样保留
      start: event.start ?? 0,
      end: event.end ?? 0,
      easingType: Math.round(event.easingType ?? 1),
      easingLeft: finite(event.easingLeft ?? 0, 'easingLeft'),
      easingRight: finite(event.easingRight ?? 1, 'easingRight'),
      bezier: event.bezier ?? 0,
      bezierPoints: event.bezierPoints ?? [0, 0, 1, 1],
    };
  });
  for (const event of out) {
    if (event.endBeat < event.startBeat) event.endBeat = event.startBeat;
  }
  out.sort((a, b) => a.startBeat - b.startBeat);
  return out;
}

export interface RpeExtrasInput {
  extraJson?: string | null;
  infoYml?: string | null;
}

export function parseRpeChart(source: string | object, extrasInput: RpeExtrasInput = {}): RpeChart {
  const raw = (typeof source === 'string' ? JSON.parse(source) : source) as {
    META?: { RPEVersion?: number; offset?: number; background?: string };
    BPMList?: { startTime?: RpeTriple; bpm: number }[];
    judgeLineList?: RawRpeLine[];
  };
  if (!raw || typeof raw !== 'object') throw new Error('RPE 根节点不是对象');
  if (!Array.isArray(raw.judgeLineList)) throw new Error('judgeLineList 缺失');
  const meta = raw.META ?? {};
  const rpeVersion = Number(meta.RPEVersion ?? 160);
  // prpr parse/extra.rs：extra.json 的 bpm 覆盖谱面 BPMList
  const extrasRaw = parseExtras(extrasInput.extraJson);
  const bpmList = new BpmList(
    extrasRaw.bpmItems ?? (raw.BPMList ?? []).map((item) => [toBeats(item.startTime ?? [0, 0, 1]), finite(item.bpm, 'BPM')]),
  );
  const extras: RpeExtras = {
    videos: extrasRaw.videos
      .map((video) => ({ ...video, startTimeSec: bpmList.timeSec(video.time) }))
      .sort((a, b) => a.startTimeSec - b.startTimeSec),
    effects: extrasRaw.effects,
  };

  const lines: RpeLine[] = (raw.judgeLineList ?? []).map((rawLine, lineIndex) => {
    const layers: RpeEventLayer[] = (rawLine.eventLayers ?? []).filter(Boolean).map((layer) => ({
      speedEvents: normalizeEvents(layer?.speedEvents, lineIndex, 'speedEvents'),
      moveXEvents: normalizeEvents(layer?.moveXEvents, lineIndex, 'moveXEvents'),
      moveYEvents: normalizeEvents(layer?.moveYEvents, lineIndex, 'moveYEvents'),
      rotateEvents: normalizeEvents(layer?.rotateEvents, lineIndex, 'rotateEvents'),
      alphaEvents: normalizeEvents(layer?.alphaEvents, lineIndex, 'alphaEvents'),
    }));
    const extended = rawLine.extended ?? {};
    const inclineEvents = normalizeEvents(extended.inclineEvents, lineIndex, 'inclineEvents');
    const scaleXEvents = normalizeEvents(extended.scaleXEvents, lineIndex, 'scaleXEvents');
    const scaleYEvents = normalizeEvents(extended.scaleYEvents, lineIndex, 'scaleYEvents');
    const textEvents = normalizeEvents(extended.textEvents, lineIndex, 'textEvents');
    const bpmfactor = finite(rawLine.bpmfactor ?? 1, 'bpmfactor');
    const integrateSpeedEasings = rawLine.integrateSpeedEasings ?? rpeVersion >= 170;

    const notes: RpeNote[] = (rawLine.notes ?? []).map((rawNote, noteIndex) => {
      const kind = NOTE_KINDS[rawNote.type];
      if (!kind) throw new Error(`判定线 ${lineIndex} 存在未知音符类型 ${rawNote.type}`);
      const startBeat = toBeats(rawNote.startTime ?? [0, 0, 1]);
      const endBeat = kind === 'hold' ? toBeats(rawNote.endTime ?? startBeat) : startBeat;
      const speed = rawNote.speed === undefined ? 1 : finite(rawNote.speed, `判定线 ${lineIndex} 音符 ${noteIndex} speed`);
      const hitTime = bpmList.timeSec(startBeat);
      const endHitTime = bpmList.timeSec(endBeat);
      return {
        kind,
        type: rawNote.type,
        positionX: finite(rawNote.positionX, `判定线 ${lineIndex} 音符 ${noteIndex} positionX`),
        yOffset: finite(rawNote.yOffset ?? 0, 'yOffset') * speed, // player-main：yOffset *= speed
        yOffsetRaw: finite(rawNote.yOffset ?? 0, 'yOffset'), // prpr ctrl 节点求值用未烘焙值
        above: rawNote.above === 1,
        isFake: rawNote.isFake === 1 || rawNote.isFake === true,
        alpha: rawNote.alpha === undefined ? 255 : clamp(finite(rawNote.alpha, 'alpha'), 0, 255),
        visibleTime: rawNote.visibleTime === undefined ? 0 : finite(rawNote.visibleTime, 'visibleTime'),
        size: rawNote.size === undefined ? 1 : finite(rawNote.size, 'size'),
        speed,
        tint: Array.isArray(rawNote.tint) && rawNote.tint.length === 3
          ? (rawNote.tint.map((value) => clamp(finite(value, 'tint'), 0, 255)) as [number, number, number])
          : null,
        tintHitEffects: Array.isArray(rawNote.tintHitEffects) && rawNote.tintHitEffects.length === 3
          ? (rawNote.tintHitEffects.map((value) => clamp(finite(value, 'tintHitEffects'), 0, 255)) as [number, number, number])
          : null,
        judgeArea: rawNote.judgeArea === undefined ? null : finite(rawNote.judgeArea, 'judgeArea'),
        hitTime,
        endHitTime,
        hitBeat: startBeat,
        headHeight: speedHeightAt(layers, bpmList, integrateSpeedEasings, startBeat / bpmfactor),
        tailHeight: kind === 'hold'
          ? speedHeightAt(layers, bpmList, integrateSpeedEasings, endBeat / bpmfactor)
          : 0,
        multipleHint: false,
      };
    }).sort((a, b) => (a.hitTime - a.visibleTime) - (b.hitTime - b.visibleTime) || a.hitTime - b.hitTime);

    // ctrl 节点（prpr parse_ctrl_events：按 x 升序保留原始键值，渲染层按区间+移位缓动求值）
    const parseControl = (items: RawRpeControl[] | undefined, key: 'alpha' | 'pos' | 'size' | 'y'): RpeControlKeyframe[] =>
      (items ?? [])
        .map((item) => ({
          x: finite(item.x ?? 0, 'ctrl x'),
          easing: Math.round(item.easing ?? 1),
          value: finite(item[key] ?? 1, `ctrl ${key}`),
        }))
        .sort((a, b) => a.x - b.x);

    return {
      bpmfactor,
      isCover: rawLine.isCover ?? 0,
      zIndex: Number(rawLine.zOrder ?? 0),
      parent: rawLine.father === undefined || rawLine.father === -1 ? null : Number(rawLine.father),
      rotWithParent: rawLine.rotateWithFather === true,
      integrateSpeedEasings,
      eventLayers: layers,
      inclineEvents,
      scaleXEvents,
      scaleYEvents,
      textEvents,
      colorEvents: normalizeEvents(extended.colorEvents, lineIndex, 'colorEvents'),
      gifEvents: normalizeEvents(extended.gifEvents, lineIndex, 'gifEvents'),
      paintEvents: normalizeEvents(extended.paintEvents, lineIndex, 'paintEvents'),
      attachUI: rawLine.attachUI === undefined || rawLine.attachUI === null ? null : Number(rawLine.attachUI),
      alphaControl: parseControl(rawLine.alphaControl, 'alpha'),
      posControl: parseControl(rawLine.posControl, 'pos'),
      sizeControl: parseControl(rawLine.sizeControl, 'size'),
      yControl: parseControl(rawLine.yControl, 'y'),
      texture: rawLine.Texture ?? 'line.png',
      scaleOnNotes: Number(rawLine.scaleOnNotes ?? 0),
      anchor: Array.isArray(rawLine.anchor) && rawLine.anchor.length === 2
        ? [finite(rawLine.anchor[0], 'anchor x'), finite(rawLine.anchor[1], 'anchor y')]
        : [0.5, 0.5],
      notes,
      lineIndex,
    };
  });

  // 循环父级检测
  for (let i = 0; i < lines.length; i += 1) {
    const seen = new Set([i]);
    let current = lines[i]!.parent;
    while (current !== null) {
      if (seen.has(current)) throw new Error('判定线存在循环 father 关系');
      seen.add(current);
      current = lines[current]!.parent;
    }
  }

  // 多押提示：同刻多音符
  const counts = new Map<string, number>();
  for (const line of lines) {
    for (const note of line.notes) {
      if (note.isFake) continue;
      const key = note.hitTime.toFixed(9);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  for (const line of lines) {
    for (const note of line.notes) {
      note.multipleHint = (counts.get(note.hitTime.toFixed(9)) ?? 0) >= 2;
    }
  }

  const kindCounts: Record<RpeNoteKind, number> = { tap: 0, drag: 0, hold: 0, flick: 0 };
  let noteCount = 0;
  let eventCount = 0;
  let maxTime = 0;
  for (const line of lines) {
    for (const note of line.notes) {
      if (note.isFake) continue;
      kindCounts[note.kind] += 1;
      noteCount += 1;
      maxTime = Math.max(maxTime, note.endHitTime);
    }
    for (const layer of line.eventLayers) {
      for (const key of ['speedEvents', 'moveXEvents', 'moveYEvents', 'rotateEvents', 'alphaEvents'] as const) {
        eventCount += layer[key].length;
        for (const event of layer[key]) maxTime = Math.max(maxTime, bpmList.timeSec(event.endBeat));
      }
    }
    for (const key of ['inclineEvents', 'scaleXEvents', 'scaleYEvents', 'textEvents'] as const) {
      eventCount += line[key].length;
      for (const event of line[key]) maxTime = Math.max(maxTime, bpmList.timeSec(event.endBeat));
    }
  }
  maxTime += 1;

  return {
    formatVersion: 3,
    offset: finite(meta.offset ?? 0, 'offset') / 1000,
    bpmList,
    lines,
    background: typeof meta.background === 'string' && meta.background ? meta.background : null,
    extras,
    info: parseInfoYml(extrasInput.infoYml),
    stats: { lineCount: lines.length, noteCount, eventCount, maxTime, kindCounts },
  };
}

interface RawRpeControl {
  x?: number;
  easing?: number;
  alpha?: number;
  pos?: number;
  size?: number;
  y?: number;
}

interface RawRpeLine {
  Texture?: string;
  eventLayers?: (RawRpeEventLayer | null | undefined)[];
  extended?: {
    inclineEvents?: RawRpeEvent[];
    scaleXEvents?: RawRpeEvent[];
    scaleYEvents?: RawRpeEvent[];
    textEvents?: RawRpeEvent[];
    colorEvents?: RawRpeEvent[];
    gifEvents?: RawRpeEvent[];
    paintEvents?: RawRpeEvent[];
  };
  notes?: RawRpeNote[];
  isCover?: number;
  zOrder?: number;
  father?: number;
  rotateWithFather?: boolean;
  integrateSpeedEasings?: boolean;
  bpmfactor?: number;
  attachUI?: number | null;
  alphaControl?: RawRpeControl[];
  posControl?: RawRpeControl[];
  sizeControl?: RawRpeControl[];
  yControl?: RawRpeControl[];
  anchor?: [number, number] | number[];
  scaleOnNotes?: number;
}

interface RawRpeEventLayer {
  speedEvents?: RawRpeEvent[];
  moveXEvents?: RawRpeEvent[];
  moveYEvents?: RawRpeEvent[];
  rotateEvents?: RawRpeEvent[];
  alphaEvents?: RawRpeEvent[];
}

interface RawRpeNote {
  type: number;
  above?: number;
  startTime?: RpeTriple;
  endTime?: RpeTriple;
  positionX?: number;
  yOffset?: number;
  alpha?: number;
  size?: number;
  speed?: number;
  isFake?: number | boolean;
  visibleTime?: number;
  tint?: number[] | [number, number, number];
  tintHitEffects?: number[] | [number, number, number];
  judgeArea?: number;
}

// ---------------- extra.json（player-main extra：videos/effects；prpr：bpm 覆盖 BPMList） ----------------
function normalizeAnimated(value: RpeEventValue | RawRpeEvent[] | undefined): RpeEventValue | RpeEvent[] {
  // 数值/数组 → 常量；事件数组 → 事件列表（值可为数值或数组，逐分量插值）
  if (
    Array.isArray(value) &&
    (typeof value[0] === 'number' || Array.isArray(value[0])) &&
    !(value[0] as { startTime?: unknown } | undefined)?.startTime
  ) {
    return value as number[];
  }
  if (Array.isArray(value) && value[0] && ('startTime' in (value[0] as object) || 'time' in (value[0] as object))) {
    return normalizeEvents(value as RawRpeEvent[], 0, 'extra');
  }
  return (value ?? 0) as RpeEventValue;
}

interface ParsedExtrasRaw {
  bpmItems: [number, number][] | null;
  videos: Omit<RpeVideo, 'startTimeSec'>[];
  effects: RpeEffect[];
}

function parseExtras(extraSource: string | null | undefined): ParsedExtrasRaw {
  const out: ParsedExtrasRaw = { bpmItems: null, videos: [], effects: [] };
  if (extraSource === undefined || extraSource === null || extraSource === '') return out;
  const raw = (typeof extraSource === 'string' ? JSON.parse(extraSource) : extraSource) as {
    bpm?: number | { time?: RpeTriple; bpm: number }[];
    videos?: { path?: string; time?: RpeTriple; scale?: string; alpha?: RpeEventValue | RawRpeEvent[]; dim?: RpeEventValue | RawRpeEvent[]; zIndex?: number; attach?: { line: number; [key: string]: unknown } | null }[];
    effects?: {
      shader?: string;
      start?: RpeTriple;
      end?: RpeTriple;
      global?: boolean;
      line?: number;
      order?: number;
      vars?: Record<string, RpeEventValue | RawRpeEvent[]>;
    }[];
  };
  if (!raw || typeof raw !== 'object') return out;
  // prpr parse/extra.rs：extra.bpm 覆盖谱面 BPMList（列表形式；数值按恒定 BPM）
  if (typeof raw.bpm === 'number') {
    out.bpmItems = [[0, finite(raw.bpm, 'extra BPM')]];
  } else if (Array.isArray(raw.bpm)) {
    out.bpmItems = raw.bpm.map((item) => [toBeats(item.time ?? [0, 0, 1]), finite(item.bpm, 'extra BPM')]);
  }
  for (const video of raw.videos ?? []) {
    if (!video.path) continue;
    out.videos.push({
      path: video.path,
      time: toBeats(video.time ?? [0, 0, 1]),
      scale: video.scale ?? 'cropCenter',
      alpha: normalizeAnimated(video.alpha ?? 1),
      dim: normalizeAnimated(video.dim ?? 0),
      zIndex: Number(video.zIndex ?? 1),
      attach: video.attach ?? null,
    });
  }
  for (const effect of raw.effects ?? []) {
    if (!effect.shader) continue;
    const vars: RpeEffect['vars'] = {};
    for (const [name, value] of Object.entries(effect.vars ?? {})) {
      vars[name] = normalizeAnimated(value);
    }
    out.effects.push({
      shader: effect.shader.replace(/^\//, ''),
      startBeat: toBeats(effect.start ?? [0, 0, 1]),
      endBeat: toBeats(effect.end ?? [9999, 0, 1]),
      global: effect.global === true,
      line: Number(effect.line ?? 0),
      order: Number(effect.order ?? 0),
      vars,
    });
  }
  out.effects.sort((a, b) => a.order - b.order || a.startBeat - b.startBeat);
  return out;
}

// ---------------- gif 判定线进度键帧（prpr parse/rpe.rs parse_gif_events） ----------------
export interface RpeGifKeyframe {
  t: number;
  v: number;
  easingType: number;
  easingLeft: number;
  easingRight: number;
  bezier: number;
  bezierPoints: number[];
}

export function buildGifAnim(events: readonly RpeEvent[], totalMs: number, bpmList: BpmList): RpeGifKeyframe[] {
  const makeKey = (t: number, v: number, easingType = 1, extra: Partial<RpeGifKeyframe> = {}): RpeGifKeyframe => ({
    t,
    v,
    easingType,
    easingLeft: 0,
    easingRight: 1,
    bezier: 0,
    bezierPoints: [0, 0, 1, 1],
    ...extra,
  });
  if (!Number.isFinite(totalMs) || totalMs <= 0) return [makeKey(0, 0)];
  const kfs: RpeGifKeyframe[] = [makeKey(0, 0)];
  let nextRep = 0;
  for (const event of events) {
    const startT = bpmList.timeSec(event.startBeat);
    const endT = bpmList.timeSec(event.endBeat);
    while (startT > nextRep / 1000) {
      kfs.push(makeKey(nextRep / 1000, 1));
      kfs.push(makeKey(nextRep / 1000, 0));
      nextRep += totalMs;
    }
    const stopProg = 1 - (nextRep - startT * 1000) / totalMs;
    kfs.push(makeKey(startT, stopProg));
    kfs.push(makeKey(startT, event.start as number, event.easingType, {
      easingLeft: event.easingLeft,
      easingRight: event.easingRight,
      bezier: event.bezier,
      bezierPoints: event.bezierPoints,
    }));
    kfs.push(makeKey(endT, event.end as number));
    nextRep = Math.round(endT * 1000 + totalMs * (1 - (event.end as number)));
  }
  while (2000 > nextRep / 1000) {
    kfs.push(makeKey(nextRep / 1000, 1));
    kfs.push(makeKey(nextRep / 1000, 0));
    nextRep += totalMs;
  }
  kfs.sort((a, b) => a.t - b.t);
  return kfs;
}

// ---------------- info.yml（背景暗度/宽高比等谱面元信息） ----------------
export function parseInfoYml(source: string | null | undefined): RpeInfo {
  const info: RpeInfo = {};
  if (typeof source !== 'string' || !source) return info;
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*?)\s*$/);
    if (!match) continue;
    const key = match[1]!;
    const value = match[2]!;
    if (key === 'backgroundDim') info.backgroundDim = Number.parseFloat(value);
    else if (key === 'aspectRatio') info.aspectRatio = Number.parseFloat(value);
    else if (key === 'lineLength') info.lineLength = Number.parseFloat(value);
    else if (key === 'offset') info.offset = Number.parseFloat(value);
    else if (key === 'forceAspectRatio') info.forceAspectRatio = value === 'true';
    else if (key === 'holdPartialCover') info.holdPartialCover = value === 'true';
    else if (key === 'noteUniformScale') info.noteUniformScale = value === 'true';
    else if (key === 'useAttachUiFix') info.useAttachUiFix = value === 'true';
    else if (key === 'name') info.name = value;
    else if (key === 'level') info.level = value;
  }
  return info;
}
