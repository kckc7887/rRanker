/**
 * 许可证：本文件语义对照 PhiZone/player（MPL-2.0，https://github.com/PhiZone/player）与
 * TeamFlos/phira（GPL-3.0，https://github.com/TeamFlos/phira）移植，相应部分按各自原许可提供
 * （与本项目 AGPL-3.0 兼容）；来源与许可证全文见仓库根 THIRD_PARTY_NOTICES.md。
 */

import {
  type RpeChart,
  type RpeEffect,
  type RpeEvent,
  type RpeGifKeyframe,
  type RpeLine,
  type RpeNote,
  type RpeVideo,
  easing,
  getEventValue,
  speedHeightAt,
} from './rpe-core';
import { lowerBoundBy, upperBoundBy } from '../../chart-preview-shared/webview-player/sorted-search';
import { createStageContext, stagePixels, type StageContext, type StageTarget, type StageVideo } from '../../chart-preview-shared/webview-player/stage';
import { createIntervalIndex } from '../../chart-preview-shared/webview-player/interval-index';
import type { NoteAssets } from './renderer';

export type RpeLineColorKey = 'white' | 'gold' | 'blue';

export interface RpeRendererSettings {
  noteScale?: number;
  multiHint?: boolean;
  backgroundDim?: number;
  lineColor?: string;
  aspectRatio?: number | null;
  flipX?: boolean;
  effects?: boolean;
}

export interface RpeGifFrames {
  frames: ImageBitmap[];
  durationsMs: number[];
  cumulativeMs: number[];
  totalMs: number;
}

export interface RpeChartAssets {
  textures: Map<string, HTMLImageElement>;
  videos: Map<RpeVideo, StageVideo>;
  shaders: Map<string, string>;
  gifs: Map<string, RpeGifFrames>;
  gifAnims: Map<number, RpeGifKeyframe[]>;
}

export interface RpeAttachUiTransform {
  x: number;
  y: number;
  rot: number;
  scaleX: number;
  scaleY: number;
  alpha: number;
  color: [number, number, number] | null;
}

const NOTE_WIDTH_RATIO_BASE = 0.13175016;
const HOLD_ATLAS: Readonly<{ normal: [number, number]; multi: [number, number] }> = /* @__PURE__ */ Object.freeze({
  normal: [50, 50],
  multi: [96, 97],
});
const HIT_FX_DURATION = 0.5;
const HIT_FX_COLUMNS = 6;
const HIT_FX_ROWS = 5;
const HIT_FX_SCALE = 1;
const JUDGE_LINE_COLORS: Readonly<Record<string, string>> = /* @__PURE__ */ Object.freeze({
  white: 'rgba(255, 255, 255, 1)',
  gold: 'rgba(255, 236, 159, 0.8823529412)',
  blue: 'rgba(180, 225, 255, 0.9215686275)',
});
const VISUAL_END_GRACE_SEC = 1;
const MAX_DRAW_DISTANCE_RATIO = 3;
const FADEOUT_TIME = 0.16; /** 单位：秒。 */

const GL_VERTEX_SHADER = `
attribute vec2 aPosition;
uniform float outputY;
varying vec2 uv;
void main() {
  uv = vec2(aPosition.x, aPosition.y * outputY) * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** WebGL1 要求循环边界固定，按 PhiZone/player 展开 GLSL 循环。 */
function transformForLoops(src: string, max = 1024): string {
  const findMatchingBrace = (code: string, openIdx: number): number => {
    let depth = 0;
    let i = openIdx;
    while (i < code.length) {
      const ch = code[i];
      if (ch === '/' && code[i + 1] === '/') {
        i += 2;
        while (i < code.length && code[i] !== '\n') i += 1;
        continue;
      }
      if (ch === '/' && code[i + 1] === '*') {
        i += 2;
        while (i < code.length && !(code[i] === '*' && code[i + 1] === '/')) i += 1;
        i += 2;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') {
        const quote = ch;
        i += 1;
        while (i < code.length) {
          if (code[i] === '\\') { i += 2; continue; }
          if (code[i] === quote) { i += 1; break; }
          i += 1;
        }
        continue;
      }
      if (ch === '{') depth += 1;
      else if (ch === '}') {
        depth -= 1;
        if (depth === 0) return i;
      }
      i += 1;
    }
    return -1;
  };

  const headerRe = /for\s*\(\s*(int|float)\s+([A-Za-z_]\w*)\s*=\s*([^;]+?)\s*;\s*([^;]+?)\s*;\s*([^)]+?)\s*\)/y;

  const makeHead = (type: string, varName: string, init: string, cond: string, iter: string): { head: string; step: string } => {
    const idx = `_${varName}_iter`;
    const limit = type === 'int' ? `${max}` : `${max}.0`;
    const it = iter.trim();
    let step: string | null = null;
    if (/\+\+/.test(it)) step = type === 'int' ? '1' : '1.0';
    else if (/--/.test(it)) step = type === 'int' ? '-1' : '-1.0';
    else {
      const plusEq = new RegExp(`^${varName}\\s*\\+=\\s*(.+)$`);
      const minusEq = new RegExp(`^${varName}\\s*-=\\s*(.+)$`);
      const p = it.match(plusEq);
      const m = it.match(minusEq);
      if (p) step = p[1]!.trim();
      if (m) step = `-(${m[1]!.trim()})`;
      if (step && type === 'float' && !/[.|eE]/.test(step)) step = `${step}.0`;
    }
    if (!step) step = type === 'int' ? '1' : '1.0';
    const assign = `${type} ${varName} = (${init.trim()}) + (${step}) * ${idx};`;
    const check = `if (!(${cond.trim()})) break;`;
    return {
      head: `for (${type} ${idx} = ${type === 'int' ? '0' : '0.0'}; ${idx} < ${limit}; ${idx}++) { ${assign} ${check} `,
      step,
    };
  };

  const replaceIndexInZone = (zone: string, varName: string, expr: string): string => {
    const bracketRe = new RegExp(`\\[\\s*${varName}\\s*\\]`, 'g');
    return zone.replace(bracketRe, `[${expr}]`);
  };

  let i = 0;
  let out = '';
  while (i < src.length) {
    if (src[i] !== 'f') {
      out += src[i++];
      continue;
    }
    headerRe.lastIndex = i;
    const m = headerRe.exec(src);
    if (!m) {
      out += src[i++];
      continue;
    }
    const [, type, varName, init, cond, iter] = m;
    out += src.slice(i, m.index);
    let j = headerRe.lastIndex;
    while (j < src.length && /\s/.test(src[j]!)) j += 1;
    const { head, step } = makeHead(type!, varName!, init!, cond!, iter!);
    const indexExpr = `(${init!.trim()}) + (${step}) * _${varName}_iter`;
    if (src[j] === '{') {
      const bodyStart = j + 1;
      const bodyEnd = findMatchingBrace(src, j);
      const body = bodyEnd >= 0 ? src.slice(bodyStart, bodyEnd) : src.slice(bodyStart);
      const nestedTransformed = transformForLoops(body, max);
      const replacedBody = replaceIndexInZone(nestedTransformed, varName!, indexExpr);
      out += head + replacedBody + ' }';
      i = bodyEnd >= 0 ? bodyEnd + 1 : src.length;
    } else {
      const stmtStart = j;
      let stmtEnd = stmtStart;
      while (stmtEnd < src.length && src[stmtEnd] !== ';') stmtEnd += 1;
      const stmt = src.slice(stmtStart, stmtEnd + 1);
      const replacedStmt = replaceIndexInZone(stmt, varName!, indexExpr);
      out += head + replacedStmt + ' }';
      i = stmtEnd + 1;
    }
  }
  return out;
}

/** ctrl 区间使用后一关键帧的缓动。 */
function ctrlValue(control: readonly { x: number; easing: number; value: number }[], x: number): number {
  if (!control || control.length === 0) return 1;
  if (control.length === 1) return control[0]!.value;
  const index = Math.max(0, Math.min(control.length - 2, lowerBoundBy(control, x, k => k.x) - 1));
  const kf1 = control[index]!;
  const kf2 = control[index + 1]!;
  if (kf2.x <= kf1.x) return kf2.value;
  const progress = easing(kf2.easing, undefined, (x - kf1.x) / (kf2.x - kf1.x));
  return kf1.value + (kf2.value - kf1.value) * progress;
}

function p(position: number, width: number): number { return (position / 1350) * width; }
function o(offset: number, height: number): number { return (offset / 900) * height; }
function d(distance: number, height: number): number { return (distance * height * 2) / 15; }

function scaledNoteWidth(stageWidth: number, noteScale: number, multipleScale = 1): number {
  return stageWidth * NOTE_WIDTH_RATIO_BASE * clamp(noteScale, 0.5, 2) * multipleScale;
}

function scaledHitEffectDiameter(stageWidth: number, noteScale: number): number {
  return stageWidth * HIT_FX_SCALE * clamp(noteScale, 0.5, 2) / 5;
}

function drawCover(context: CanvasRenderingContext2D, image: HTMLImageElement | null, width: number, height: number): void {
  if (!image?.naturalWidth) return;
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  context.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
}

function drawTextureFlippedY(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource,
  source: [number, number, number, number] | null,
  destination: [number, number, number, number],
): void {
  const [dx, dy, dw, dh] = destination;
  context.save();
  context.translate(0, 2 * dy + dh);
  context.scale(1, -1);
  if (source) context.drawImage(image, ...source, dx, dy, dw, dh);
  else context.drawImage(image, dx, dy, dw, dh);
  context.restore();
}

interface HitEffectEvent {
  time: number;
  lineIndex: number;
  note: RpeNote;
  seed: number;
}

function buildHitEvents(chart: RpeChart): HitEffectEvent[] {
  const effects: HitEffectEvent[] = [];
  let seed = 0;
  chart.lines.forEach((line, lineIndex) => {
    line.notes.forEach((note) => {
      if (note.isFake) return;
      seed += 1;
      effects.push({ time: note.hitTime, lineIndex, note, seed });
    });
  });
  effects.sort((a, b) => a.time - b.time || a.lineIndex - b.lineIndex || a.seed - b.seed);
  return effects;
}

function particleAngle(seed: number, index: number): number {
  const mixed = Math.sin((seed * 17.17 + index * 31.73) * 12.9898) * 43758.5453;
  return (mixed - Math.floor(mixed)) * Math.PI * 2;
}

type NoteQuery = (time: number, height: number) => RpeNote[];

function visibleNotes(line: RpeLine): NoteQuery {
  let minY = Infinity, maxY = -Infinity;
  for (const key of line.yControl) { minY = Math.min(minY, key.value); maxY = Math.max(maxY, key.value); }
  if (!line.yControl.length) minY = maxY = 1;
  /** Back、Elastic 缓动允许越过控制点两端。 */
  const bounded = minY === maxY || line.yControl.every(key => key.easing < 20 || [22, 26, 27, 28].includes(key.easing));
  const timeRange = (n: RpeNote): [number, number] => [n.hitTime - n.visibleTime, n.kind === 'hold' ? n.endHitTime + VISUAL_END_GRACE_SEC : n.hitTime];
  const notes = createIntervalIndex(line.notes, timeRange, n => {
    if (!bounded || !n.speed || (minY <= 0 && maxY >= 0)) return [-Infinity, Infinity];
    let low = Infinity, high = -Infinity;
    for (const value of [minY, maxY]) {
      const factor = n.speed * value;
      const center = n.yOffset / (120 * factor), radius = MAX_DRAW_DISTANCE_RATIO * 7.5 / Math.abs(factor);
      low = Math.min(low, center - radius);
      high = Math.max(high, center + radius);
    }
    const tail = n.kind === 'hold' ? n.tailHeight : n.headHeight;
    return [Math.min(n.headHeight, tail) + low, Math.max(n.headHeight, tail) + high];
  });
  const holds = createIntervalIndex(line.notes.filter(n => n.kind === 'hold'), n => [n.hitTime, n.endHitTime]);
  const order = new Map(line.notes.map((n, i) => [n, i]));
  return (time, height) => {
    const items = notes(time, time, height, height), pinned = holds(time, time);
    if (!pinned.length) return items;
    return [...new Set([...items, ...pinned])].sort((a, b) => order.get(a)! - order.get(b)!);
  };
}
interface LineState {
  line: RpeLine;
  lineIndex: number;
  alpha: number;
  alphaExt: number;
  drawBelow: boolean;
  color: [number, number, number] | null;
  gif: number;
  paint: number | null;
  moveX: number;
  moveY: number;
  rotDeg: number;
  incline: number;
  lineHeight: number;
  scaleX: number;
  scaleY: number;
  text: string;
  width: number;
  height: number;
  cos: number;
  sin: number;
  screenX: number;
  screenY: number;
}

export class RpeRenderer {
  readonly canvas: HTMLCanvasElement;
  readonly lastBox: { aspect: number; boxX: number; boxY: number; boxWidth: number; boxHeight: number } = {
    aspect: 0, boxX: 0, boxY: 0, boxWidth: 0, boxHeight: 0,
  };
  attachUi: Partial<Record<number, RpeAttachUiTransform>> = {};
  effectsActive = 0;
  lastRenderedTime = 0;
  lastVisitedNotes = 0;
  maxVisitedNotes = 0;
  lastDrawnNotes = 0;
  lastRenderedEffects = 0;
  lastNotesOnHiddenLines = 0;
  maxNotesOnHiddenLines = 0;
  lastHitEffectDiameter = 0;

  private readonly context: StageContext;
  private readonly resizeObserver: ResizeObserver;
  private drawOrder: number[] = [];
  private videoIntervals: (start: number, end: number) => RpeVideo[] = () => [];
  private unknownVideos: RpeVideo[] = [];
  private activeVideos = new Set<RpeVideo>();
  readonly indexVideos = (): void => {
    this.unknownVideos = [];
    const known = (this.chart?.extras.videos ?? []).filter(video => {
      const media = this.chartAssets?.videos.get(video);
      if (!media) return false;
      const duration = media.duration;
      if (duration > 0 && Number.isFinite(duration)) return true;
      this.unknownVideos.push(video);
      return false;
    });
    this.videoIntervals = createIntervalIndex(known, video =>
      [video.startTimeSec, video.startTimeSec + this.chartAssets!.videos.get(video)!.duration]);
  };
  private activeEffects: (start: number, end: number) => RpeEffect[] = () => [];
  private chart: RpeChart | null = null;
  private illustration: HTMLImageElement | null = null;
  private noteAssets: NoteAssets | null = null;
  private chartAssets: RpeChartAssets | null = null;
  private noteQueries: NoteQuery[] = [];
  private hitEvents: HitEffectEvent[] = [];
  private settings: RpeRendererSettings = { noteScale: 1, multiHint: true, backgroundDim: 0.55, lineColor: 'white' };
  private fullscreen = false;
  private disposed = false;
  private playing = false;
  private playbackSpeed = 1;
  private readonly gl: WebGLRenderingContext;
  private glPrograms = new Map<string, WebGLProgram | null>();
  private shaderDefaults = new Map<string, [string, number | number[]][]>();
  private glQuad: WebGLBuffer | null = null;
  private effectTargets: StageTarget[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.context = createStageContext(canvas);
    this.gl = this.context.gl;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
  }

  setChart(chart: RpeChart): void {
    this.chart = chart;
    this.drawOrder = chart.lines.map((_, i) => i).sort((a, b) => chart.lines[a]!.zIndex - chart.lines[b]!.zIndex);
    this.activeEffects = createIntervalIndex(chart.extras.effects, effect => [chart.bpmList.timeSec(effect.startBeat), chart.bpmList.timeSec(effect.endBeat)]);
    this.hitEvents = buildHitEvents(chart);
    this.noteQueries = chart.lines.map(visibleNotes);
    this.indexVideos();
  }

  setChartAssets(assets: RpeChartAssets): void {
    if (this.chartAssets !== assets) {
      for (const video of this.chartAssets?.videos.values() ?? []) video.dispose();
    }
    this.activeVideos.clear();
    for (const program of this.glPrograms.values()) if (program) this.gl.deleteProgram(program);
    this.glPrograms.clear();
    this.shaderDefaults.clear();
    this.chartAssets = assets;
    this.indexVideos();
  }
  setIllustration(image: HTMLImageElement | null): void { this.illustration = image; }
  setNoteAssets(assets: NoteAssets): void {
    this.noteAssets = assets;
  }

  setSettings(settings: RpeRendererSettings): void { this.settings = { ...this.settings, ...settings }; }

  setFullscreen(active: boolean): void {
    if (this.fullscreen === active) return;
    this.fullscreen = active;
    this.resize();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.resizeObserver.disconnect();
    for (const program of this.glPrograms.values()) if (program) this.gl.deleteProgram(program);
    this.glPrograms.clear();
    if (this.glQuad) this.gl.deleteBuffer(this.glQuad);
    this.effectTargets = [];
    this.context.dispose();
    this.chart = null;
    this.chartAssets = null;
    this.illustration = null;
    this.noteAssets = null;
    this.noteQueries = [];
    this.videoIntervals = () => [];
    this.unknownVideos = [];
    this.activeVideos.clear();
    this.hitEvents = [];
    this.activeEffects = () => [];
  }

  resize(): void {
    if (this.disposed) return;
    const rect = this.canvas.getBoundingClientRect();
    const { width, height } = stagePixels(rect.width, rect.height, this.gl);
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  private lineState(lineIndex: number, time: number, width: number, height: number): Omit<LineState, 'cos' | 'sin' | 'screenX' | 'screenY'> {
    const line = this.chart!.lines[lineIndex]!;
    const bpmList = this.chart!.bpmList;
    const beat = bpmList.beat(time) / line.bpmfactor;
    const sample = (events: readonly RpeEvent[]) => events.length
      ? getEventValue(events[Math.max(0, lowerBoundBy(events, beat, e => e.startBeat) - 1)]!, beat, bpmList) : undefined;
    let alpha = 0;
    let x = 0;
    let y = 0;
    let rot = 0;
    const lineHeight = speedHeightAt(line.eventLayers, bpmList, line.integrateSpeedEasings, beat);
    for (let layerIndex = 0; layerIndex < line.eventLayers.length; layerIndex += 1) {
      const layer = line.eventLayers[layerIndex]!;
      alpha += (sample(layer.alphaEvents) as number) ?? 0;
      x += (sample(layer.moveXEvents) as number) ?? 0;
      y += (sample(layer.moveYEvents) as number) ?? 0;
      rot += (sample(layer.rotateEvents) as number) ?? 0;
    }
    const incline = (sample(line.inclineEvents) as number) ?? 0;
    const scaleXValue = (sample(line.scaleXEvents) as number) ?? 1;
    const scaleYValue = (sample(line.scaleYEvents) as number) ?? 1;
    const textValue = sample(line.textEvents);
    const colorValue = sample(line.colorEvents);
    const gif = this.gifValue(this.chartAssets?.gifAnims.get(lineIndex) ?? [], time);
    const paintValue = sample(line.paintEvents) as number | null | undefined;
    /** RPE 负 alpha 隐藏整线及音符。 */
    const alphaExt = alpha < 0 ? 1 : 0;

    const drawBelow = line.isCover !== 1;
    return {
      line,
      lineIndex,
      alpha: clamp(alpha, 0, 255) / 255,
      alphaExt,
      drawBelow,
      color: Array.isArray(colorValue) && colorValue.length === 3 ? (colorValue as [number, number, number]) : null,
      gif,
      paint: typeof paintValue === 'number' ? paintValue : null,
      moveX: x,
      moveY: y,
      rotDeg: rot,
      incline,
      lineHeight,
      scaleX: Number.isFinite(scaleXValue) ? scaleXValue : 1,
      scaleY: Number.isFinite(scaleYValue) ? scaleYValue : 1,
      text: typeof textValue === 'string' ? textValue : '',
      width,
      height,
    };
  }

  private worldState(lineIndex: number, time: number, width: number, height: number, states?: LineState[]): LineState {
    if (states?.[lineIndex]) return states[lineIndex]!;
    const line = this.chart!.lines[lineIndex]!;
    const state = this.lineState(lineIndex, time, width, height);
    if (line.parent !== null && line.parent !== undefined) {
      const parent = this.worldState(line.parent, time, width, height, states);
      const dx = p(state.moveX, width);
      const dy = o(-state.moveY, height);
      const cosP = Math.cos((parent.rotDeg * Math.PI) / 180);
      const sinP = Math.sin((parent.rotDeg * Math.PI) / 180);
      const px = parent.screenX - width / 2;
      const py = parent.screenY - height / 2;
      const nx = px + dx * cosP - dy * sinP;
      const ny = py + dy * cosP + dx * sinP;
      const totalRot = line.rotWithParent ? state.rotDeg + parent.rotDeg : state.rotDeg;
      const rad = (totalRot * Math.PI) / 180;
      const result = {
        ...state,
        rotDeg: totalRot,
        cos: Math.cos(rad),
        sin: Math.sin(rad),
        screenX: nx + width / 2,
        screenY: ny + height / 2,
      };
      if (states) states[lineIndex] = result;
      return result;
    }
    const rad = (state.rotDeg * Math.PI) / 180;
    const result = {
      ...state,
      cos: Math.cos(rad),
      sin: Math.sin(rad),
      screenX: p(state.moveX, width) + width / 2,
      screenY: o(-state.moveY, height) + height / 2,
    };
    if (states) states[lineIndex] = result;
    return result;
  }

  private drawNotes(context: CanvasRenderingContext2D, lineIndex: number, state: LineState, time: number): void {
    const visible = this.noteQueries[lineIndex]!(time, state.lineHeight);
    for (const kind of ['hold', 'drag', 'tap', 'flick'] as const) {
      for (const note of visible) {
        if (note.kind !== kind) continue;
        this.lastVisitedNotes += 1;
        if (this.drawNote(context, note, state, time)) this.recordDraw(state);
      }
    }
  }

  private recordDraw(state: LineState): void {
    this.lastDrawnNotes += 1;
    if (state.alpha <= 0.002) this.lastNotesOnHiddenLines += 1;
  }

  private drawNote(context: CanvasRenderingContext2D, note: RpeNote, state: LineState, time: number): boolean {
    if (time < note.hitTime - note.visibleTime) return false;
    if (note.isFake && time >= note.hitTime && note.kind !== 'hold') return false;

    if (note.kind !== 'hold' && time >= note.hitTime) return false;
    const line = state.line;

    const ctrlX = (note.headHeight - state.lineHeight + note.yOffsetRaw / note.speed) * 450;
    const ctrlAlpha = ctrlValue(line.alphaControl, ctrlX);
    const ctrlSize = ctrlValue(line.sizeControl, ctrlX);
    const ctrlPos = ctrlValue(line.posControl, ctrlX);
    const ctrlY = ctrlValue(line.yControl, ctrlX);
    const effectiveSpeed = note.speed * ctrlY;
    const direction = note.above ? -1 : 1;

    const headDist = d((note.headHeight - state.lineHeight) * effectiveSpeed, state.height) + o(note.yOffset, state.height);
    if (note.kind !== 'hold' && Math.abs(headDist) > state.height * MAX_DRAW_DISTANCE_RATIO) return false;
    const chartDist = (headDist / state.height) * 900;
    const inclineShift = Math.tan(((note.positionX / 675) * -state.incline * Math.PI) / 180) * chartDist;
    const along = p(note.positionX + inclineShift, state.width) * ctrlPos;
    const isMulti = this.settings.multiHint && note.multipleHint;
    const style = isMulti ? this.noteAssets!.multi : this.noteAssets!.normal;
    const multipleScale = isMulti ? style[note.kind].naturalWidth / this.noteAssets!.normal[note.kind].naturalWidth : 1;
    /** Hold 头尾高度不随 size；其它音符高度仅在 noteUniformScale 时缩放。 */
    const baseNoteWidth = scaledNoteWidth(state.width, this.settings.noteScale ?? 1, multipleScale);
    const noteWidth = baseNoteWidth * note.size * ctrlSize;
    const noteHeightFactor = this.chart!.info.noteUniformScale === true ? note.size * ctrlSize : 1;
    context.save();
    context.translate(state.screenX, state.screenY);
    context.rotate(Math.atan2(state.sin, state.cos));
    context.translate(along, 0);
    context.scale(1, direction);
    if (note.kind === 'hold') {

      const coverDist = this.chart!.info.holdPartialCover === true
        ? (note.tailHeight - state.lineHeight) * effectiveSpeed
        : (note.headHeight - state.lineHeight) * effectiveSpeed;
      if (!state.drawBelow && time < note.hitTime && coverDist < 0) {
        context.restore();
        return false;
      }
      const tailDist = d((note.tailHeight - state.lineHeight) * effectiveSpeed, state.height) + o(note.yOffset, state.height);

      const bottom = time >= note.hitTime ? o(note.yOffset, state.height) : headDist;
      const top = tailDist;
      if (top <= bottom) {
        context.restore();
        return false;
      }
      context.globalAlpha = note.alpha / 255 * ctrlAlpha;
      if (note.tint) this.context.tint(note.tint[0] / 255, note.tint[1] / 255, note.tint[2] / 255);
      const holdImage = style.hold;
      this.drawHold(
        context,
        holdImage,
        isMulti ? HOLD_ATLAS.multi : HOLD_ATLAS.normal,
        noteWidth,
        baseNoteWidth,
        bottom,
        top,
        time < note.hitTime,
      );
    } else {

      let alpha = note.alpha / 255 * ctrlAlpha;
      if (!state.drawBelow) {
        if ((note.headHeight - state.lineHeight) * effectiveSpeed < 0) {
          context.restore();
          return false;
        }
        alpha *= Math.max(0, 1 + Math.min(0, note.hitTime - time) / FADEOUT_TIME);
      }
      context.globalAlpha = alpha;
      if (note.tint) this.context.tint(note.tint[0] / 255, note.tint[1] / 255, note.tint[2] / 255);
      const image = style[note.kind];

      const imageWidth = image.width;
      const imageHeight = image.height;
      const noteHeight = baseNoteWidth * noteHeightFactor * imageHeight / imageWidth;
      drawTextureFlippedY(context, image, null, [-noteWidth / 2, headDist - noteHeight / 2, noteWidth, noteHeight]);
    }
    context.restore();
    return true;
  }

  private drawHold(
    context: CanvasRenderingContext2D,
    image: CanvasImageSource,
    [tailAtlas, headAtlas]: [number, number],
    width: number,
    baseWidth: number,
    bottom: number,
    top: number,
    showHead: boolean,
  ): void {

    const source = image as CanvasImageSource & { naturalWidth?: number; naturalHeight?: number };
    const imageWidth = (image as { width?: number }).width ?? source.naturalWidth ?? 0;
    const imageHeight = (image as { height?: number }).height ?? source.naturalHeight ?? 0;
    const pixelScale = baseWidth / imageWidth;
    const headHeight = headAtlas * pixelScale;
    const tailHeight = tailAtlas * pixelScale;
    const bodySourceHeight = imageHeight - tailAtlas - headAtlas;
    const bodyHeight = top - bottom;

    drawTextureFlippedY(
      context,
      image,
      [0, tailAtlas, imageWidth, bodySourceHeight],
      [-width / 2, bottom - 0.25, width, bodyHeight + 0.5],
    );
    if (showHead) {
      drawTextureFlippedY(
        context,
        image,
        [0, imageHeight - headAtlas, imageWidth, headAtlas],
        [-width / 2, bottom - headHeight, width, headHeight + 0.25],
      );
    }
    drawTextureFlippedY(
      context,
      image,
      [0, 0, imageWidth, tailAtlas],
      [-width / 2, top - 0.25, width, tailHeight + 0.25],
    );
  }

  private gifValue(animKfs: readonly RpeGifKeyframe[], timeSec: number): number {
    if (!animKfs || animKfs.length === 0) return 0;
    const i = Math.max(0, lowerBoundBy(animKfs, timeSec, k => k.t) - 1);
    const kf1 = animKfs[i]!;
    if (i >= animKfs.length - 1) return kf1.v;
    const kf2 = animKfs[i + 1]!;
    if (kf2.t <= kf1.t) return kf2.v; // 同刻键帧：后者胜（prpr Anim::set_time 语义）
    const x = (timeSec - kf1.t) / (kf2.t - kf1.t);
    const progress = easing(kf1.easingType, kf1.bezier === 1 ? kf1.bezierPoints : undefined, x, kf1.easingLeft, kf1.easingRight);
    return kf1.v + (kf2.v - kf1.v) * progress;
  }

  private drawTintedImage(
    context: CanvasRenderingContext2D,
    image: CanvasImageSource,
    tint: [number, number, number] | null,
    x: number,
    y: number,
    width: number,
    height: number,
  ): void {
    if (tint) this.context.tint(tint[0] / 255, tint[1] / 255, tint[2] / 255);
    context.drawImage(image, x, y, width, height);
  }

  private drawLine(context: CanvasRenderingContext2D, state: LineState): void {
    context.save();
    context.translate(state.screenX, state.screenY);
    context.rotate(Math.atan2(state.sin, state.cos));
    context.globalAlpha = state.alpha;
    const tint = state.color ?? null;
    const line = state.line;
    const tintStyle = tint ? `rgb(${tint[0]},${tint[1]},${tint[2]})` : null;
    if (line.texture === 'line.png') {
      if (line.paintEvents.length > 0) {

        const paint = state.paint ?? -1;
        if (paint > 0) {
          const radius = (paint * state.width) / Math.max(1, this.canvas.clientWidth);
          context.fillStyle = tintStyle ?? '#ffffff';
          context.beginPath();
          context.arc(0, 0, radius, 0, Math.PI * 2);
          context.fill();
        }
        context.restore();
        return;
      }
      if (line.textEvents.length > 0) {

        context.fillStyle = tintStyle ?? '#ffffff';
        context.font = `${p(100, state.width)}px system-ui, -apple-system, "Segoe UI", "Microsoft YaHei UI", sans-serif`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(state.text, 0, 0);
        context.restore();
        return;
      }

      const infoLineLength = this.chart!.info.lineLength;
      const lineLength = Number.isFinite(infoLineLength) && (infoLineLength ?? 0) > 0 ? infoLineLength! : 6;
      const halfSpan = (lineLength / 2) * state.width;
      context.strokeStyle = tintStyle ?? (JUDGE_LINE_COLORS[this.settings.lineColor ?? 'white'] ?? JUDGE_LINE_COLORS.white)!;
      context.lineWidth = Math.max(2, state.height * 0.005);
      context.beginPath();
      context.moveTo(-halfSpan, 0);
      context.lineTo(halfSpan, 0);
      context.stroke();
      context.restore();
      return;
    }

    const gifData = line.gifEvents.length > 0 ? this.chartAssets?.gifs.get(line.texture) : undefined;
    const staticImage = gifData ? undefined : this.chartAssets?.textures.get(line.texture);
    if (gifData?.frames.length) {
      const progress = clamp(state.gif, 0, 1);
      const elapsed = progress * gifData.totalMs;
      const frame = gifData.frames[Math.min(gifData.frames.length - 1, lowerBoundBy(gifData.cumulativeMs, elapsed, t => t))]!;
      const unit = state.width / 1350;
      const drawWidth = frame.width * unit * state.scaleX;
      const drawHeight = frame.height * unit * state.scaleY;
      this.drawTintedImage(context, frame, tint, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
      context.restore();
      return;
    }
    if (staticImage?.naturalWidth) {

      const unit = state.width / 1350;
      const drawWidth = staticImage.naturalWidth * unit * state.scaleX;
      const drawHeight = staticImage.naturalHeight * unit * state.scaleY;
      this.drawTintedImage(context, staticImage, tint, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
      context.restore();
      return;
    }
    context.strokeStyle = tintStyle ?? (JUDGE_LINE_COLORS[this.settings.lineColor ?? 'white'] ?? JUDGE_LINE_COLORS.white)!;
    context.lineWidth = Math.max(2, state.height * 0.005);
    context.beginPath();
    context.moveTo(-state.width * 3, 0);
    context.lineTo(state.width * 3, 0);
    context.stroke();
    context.restore();
  }

  render(time: number, playing = false, playbackSpeed = 1, seek = false): void {
    if (this.disposed) return;
    this.playing = playing;
    this.playbackSpeed = playbackSpeed;
    this.renderFrame(time, seek);
  }

  private renderFrame(time: number, seek: boolean): void {
    const context = this.context;
    const pixelWidth = this.canvas.width;
    const pixelHeight = this.canvas.height;
    const ratio = pixelWidth / Math.max(1, this.canvas.clientWidth);
    const width = pixelWidth / ratio;
    const height = pixelHeight / ratio;
    context.beginFrame();
    const effects = this.settings.effects === false || !this.chart ? [] : this.activeEffects(time, time).filter(e =>
      time < this.chart!.bpmList.timeSec(e.endBeat) && this.prepareEffect(e.shader));
    if (this.effectTargets[0] && (this.effectTargets[0].width !== pixelWidth || this.effectTargets[0].height !== pixelHeight)) {
      for (const target of this.effectTargets) context.releaseTarget(target);
      this.effectTargets = [];
    }
    const targetCount = Math.min(2, effects.length);
    while (this.effectTargets.length > targetCount) context.releaseTarget(this.effectTargets.pop()!);
    if (targetCount && !this.effectTargets.length) this.effectTargets.push(context.acquireTarget(pixelWidth, pixelHeight));
    if (targetCount > 1) {
      const w = Math.max(1, Math.floor(pixelWidth * context.effectScale));
      const h = Math.max(1, Math.floor(pixelHeight * context.effectScale));
      const swap = this.effectTargets[1];
      if (swap && (swap.width !== w || swap.height !== h)) context.releaseTarget(this.effectTargets.pop()!);
      if (this.effectTargets.length === 1) this.effectTargets.push(context.acquireTarget(w, h));
    }
    const scene = this.effectTargets[0];
    if (scene) context.bindTarget(scene);
    this.effectsActive = effects.length;
    /** RPE 的图像与场景均以左上角为 uv 原点。 */
    context.setTransform(ratio, 0, 0, scene ? -ratio : ratio, 0, scene ? pixelHeight : 0);
    context.globalAlpha = 1;
    context.fillStyle = '#000000';
    context.fillRect(0, 0, width, height);

    if (!this.chart) { context.flush(); return; }
    this.lastVisitedNotes = 0;
    this.lastDrawnNotes = 0;
    this.lastNotesOnHiddenLines = 0;

    const infoAspect = this.chart.info.aspectRatio;
    const chartAspect = Number.isFinite(infoAspect) && (infoAspect ?? 0) > 0 ? infoAspect! : null;
    let aspect = this.settings.aspectRatio ?? undefined;
    if (!aspect) {
      aspect = chartAspect !== null
        ? (this.chart.info.forceAspectRatio ? chartAspect : Math.min(chartAspect, width / height))
        : width / height;
    }
    let boxWidth = width;
    let boxHeight = height;
    if (width / height > aspect) {
      boxWidth = height * aspect;
      boxHeight = height;
    } else {
      boxWidth = width;
      boxHeight = width / aspect;
    }
    const boxX = (width - boxWidth) / 2;
    const boxY = (height - boxHeight) / 2;
    this.lastBox.aspect = aspect;
    this.lastBox.boxX = boxX;
    this.lastBox.boxY = boxY;
    this.lastBox.boxWidth = boxWidth;
    this.lastBox.boxHeight = boxHeight;
    context.save();
    context.translate(boxX, boxY);
    if (this.settings.flipX) {

      context.translate(boxWidth, 0);
      context.scale(-1, 1);
    }
    drawCover(context, this.illustration, boxWidth, boxHeight);
    context.fillStyle = `rgba(4, 3, 8, ${clamp(this.settings.backgroundDim ?? 0.55, 0, 1)})`;
    context.fillRect(0, 0, boxWidth, boxHeight);

    const states: LineState[] = [];
    const drawOrder = this.drawOrder;
    for (let i = 0; i < this.chart.lines.length; i++) this.worldState(i, time, boxWidth, boxHeight, states);

    const clips = [...this.videoIntervals(time, time), ...this.unknownVideos.filter(video => time >= video.startTimeSec)];
    const active = new Set(clips);
    for (const video of this.activeVideos) {
      if (active.has(video)) continue;
      this.chartAssets?.videos.get(video)?.sync({
        time: time - video.startTimeSec, active: false, playing: this.playing, rate: this.playbackSpeed,
      });
    }
    this.activeVideos = active;
    for (const video of clips) this.drawVideo(context, video, time, boxWidth, boxHeight, states, seek);
    for (const lineIndex of drawOrder) {
      const state = states[lineIndex]!;
      if (state.alphaExt === 1) continue; // prpr：RPE 负 alpha＝整线连同音符隐藏
      if (state.line.attachUI !== null) continue; // prpr：attachUI 线不参与绘制
      if (state.alpha > 0.002 || state.text) {
        this.drawLine(context, state);
      }
    }
    if (this.noteAssets) {
      for (const lineIndex of drawOrder) {
        const state = states[lineIndex]!;
        if (state.alphaExt === 1) continue;
        if (state.line.attachUI !== null) continue;
        this.drawNotes(context, lineIndex, state, time);
      }
    }
    this.drawHitEffects(context, time, boxWidth, boxHeight);

    const attachUi: Partial<Record<number, RpeAttachUiTransform>> = {};
    for (let lineIndex = 0; lineIndex < this.chart.lines.length; lineIndex += 1) {
      const attach = this.chart.lines[lineIndex]!.attachUI;
      if (attach === null || attach === undefined || attach < 1 || attach > 7) continue;
      const state = states[lineIndex]!;
      attachUi[attach] = {
        x: state.screenX + boxX,
        y: state.screenY + boxY,
        rot: Math.atan2(state.sin, state.cos),
        scaleX: state.scaleX,
        scaleY: state.scaleY,
        alpha: state.alpha,
        color: state.color,
      };
    }
    this.attachUi = attachUi;
    context.restore();
    context.globalAlpha = 1;
    this.lastRenderedTime = time;
    this.maxVisitedNotes = Math.max(this.maxVisitedNotes, this.lastVisitedNotes);
    this.maxNotesOnHiddenLines = Math.max(this.maxNotesOnHiddenLines, this.lastNotesOnHiddenLines);
    context.flush();
    if (scene) this.renderEffectPasses(time, scene, effects);
  }

  private drawHitEffects(context: StageContext, time: number, width: number, height: number): void {
    this.lastRenderedEffects = 0;
    const fx = this.noteAssets?.fx;
    if (!fx || !this.hitEvents.length) return;
    const first = lowerBoundBy(this.hitEvents, time - HIT_FX_DURATION, (effect) => effect.time);
    const end = upperBoundBy(this.hitEvents, time, (effect) => effect.time);
    const frameWidth = fx.naturalWidth / HIT_FX_COLUMNS;
    const frameHeight = fx.naturalHeight / HIT_FX_ROWS;
    const size = scaledHitEffectDiameter(width, this.settings.noteScale ?? 1);
    this.lastHitEffectDiameter = size;
    for (let index = first; index < end; index += 1) {
      const effect = this.hitEvents[index]!;
      const age = time - effect.time;
      if (age < 0 || age >= HIT_FX_DURATION) continue;
      const progress = age / HIT_FX_DURATION;
      const frame = Math.min(HIT_FX_COLUMNS * HIT_FX_ROWS - 1, Math.floor(progress * HIT_FX_COLUMNS * HIT_FX_ROWS));
      const state = this.worldState(effect.lineIndex, effect.time, width, height);
      const along = p(effect.note.positionX, width);
      const distance = (effect.note.above ? -1 : 1) * o(effect.note.yOffset, height);
      const x = state.screenX + state.cos * along - state.sin * distance;
      const y = state.screenY + state.sin * along + state.cos * distance;
      const alpha = progress < 0.5 ? 1 - progress * 0.6 : 1.4 * (1 - progress);
      context.save();
      context.globalAlpha = clamp(alpha, 0, 1);
      const tint = effect.note.tintHitEffects;
      context.save();
      if (tint) this.context.tint(tint[0] / 255, tint[1] / 255, tint[2] / 255);
      context.drawMask(
        fx, '#ffec9fe1',
        frame % HIT_FX_COLUMNS * frameWidth,
        Math.floor(frame / HIT_FX_COLUMNS) * frameHeight,
        frameWidth,
        frameHeight,
        x - size / 2,
        y - size / 2,
        size,
        size,
      );
      context.restore();
      const particleSize = width * HIT_FX_SCALE * clamp(this.settings.noteScale ?? 1, 0.5, 2) / 44;
      for (let particle = 0; particle < 4; particle += 1) {
        const angle = particleAngle(effect.seed, particle);
        const radius = width * clamp(this.settings.noteScale ?? 1, 0.5, 2) * (1.25 * age - 1.5 * age * age);
        const px = x + Math.cos(angle) * radius;
        const py = y + Math.sin(angle) * radius;
        context.save();
        context.translate(px, py);
        context.rotate(angle + Math.PI / 4);
        context.fillStyle = '#ffec9f';
        context.fillRect(-particleSize / 2, -particleSize / 2, particleSize, particleSize);
        context.restore();
      }
      context.restore();
      this.lastRenderedEffects += 1;
    }
  }

  private eventValueAt(value: unknown, beat: number): unknown {

    if (!Array.isArray(value) || !value[0] || !('startBeat' in (value[0] as object))) return value;
    const events = value as RpeEvent[];
    return getEventValue(events[Math.max(0, lowerBoundBy(events, beat, e => e.startBeat) - 1)]!, beat, this.chart!.bpmList);
  }

  private drawVideo(context: CanvasRenderingContext2D, video: RpeVideo, time: number, width: number, height: number, states: LineState[], seek: boolean): void {
    const media = this.chartAssets?.videos.get(video);
    if (!media) return;
    const local = time - video.startTimeSec;
    if (!media.sync({ time: local, active: local >= 0 && (media.duration === 0 || local < media.duration),
      playing: this.playing, rate: this.playbackSpeed, seek })) return;
    const element = media.element;
    const beat = this.chart!.bpmList.beat(time);
    let alpha = this.eventValueAt(video.alpha, beat) as number | number[] | string;
    const dim = this.eventValueAt(video.dim, beat) as number | number[] | string;
    const vw = element.videoWidth;
    const vh = element.videoHeight;

    let cx = width / 2;
    let cy = height / 2;
    let rot = 0;
    if (video.attach) {
      const state = states[video.attach.line];
      if (!state) return;
      cx = state.screenX;
      cy = state.screenY;
      rot = Math.atan2(state.sin, state.cos);
      alpha = (Number(alpha) || 0) * state.alpha; // prpr：视频颜色取线色（含线 alpha）
    }
    const mode = video.scale === 'inside' ? 'fit' : video.scale === 'fit' ? 'stretch' : 'cover';
    let drawWidth: number;
    let drawHeight: number;
    if (mode === 'stretch') {
      drawWidth = width;
      drawHeight = height;
    } else if (mode === 'fit') {
      const scale = Math.min(width / vw, height / vh);
      drawWidth = vw * scale;
      drawHeight = vh * scale;
    } else {
      const scale = Math.max(width / vw, height / vh);
      drawWidth = vw * scale;
      drawHeight = vh * scale;
    }
    context.save();
    context.translate(cx, cy);
    context.rotate(rot);
    context.globalAlpha = clamp(Number(alpha) || 0, 0, 1);
    context.drawImage(element, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
    context.restore();
    if ((Number(dim) || 0) > 0) {

      context.save();
      context.translate(cx, cy);
      context.rotate(rot);
      context.globalAlpha = clamp(Number(dim) || 0, 0, 1);
      context.fillStyle = '#000000';
      context.fillRect(-drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
      context.restore();
    }
  }

  private renderEffectPasses(time: number, scene: StageTarget, effects: readonly RpeEffect[]): void {
    const gl = this.gl, stage = this.context;
    const next = this.effectTargets[1] ?? null;
    let source = scene;
    try {
      gl.disable(gl.SCISSOR_TEST); gl.disable(gl.STENCIL_TEST); gl.disable(gl.BLEND);
      for (let i = 0; i < effects.length; i++) {
        const effect = effects[i]!;
        const target = i === effects.length - 1 ? null : source === scene ? next : scene;
        gl.bindFramebuffer(gl.FRAMEBUFFER, target?.framebuffer ?? null);
        const w = target?.width ?? scene.width, h = target?.height ?? scene.height;
        gl.viewport(0, 0, w, h);
        const program = this.glPrograms.get(effect.shader)!;
        gl.useProgram(program);
        gl.uniform1f(gl.getUniformLocation(program, 'outputY'), target ? 1 : -1);
        this.applyEffectUniforms(gl, program, effect, time, w, h);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, source.texture);
        gl.uniform1i(gl.getUniformLocation(program, 'screenTexture'), 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.glQuad);
        const position = gl.getAttribLocation(program, 'aPosition');
        gl.enableVertexAttribArray(position);
        gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        if (target) source = target;
      }
    } finally {
      stage.bindTarget(null);
    }
  }

  private applyEffectUniforms(
    gl: WebGLRenderingContext,
    program: WebGLProgram,
    effect: RpeEffect,
    time: number,
    pixelW: number,
    pixelH: number,
  ): void {
    const setUniform = (name: string, value: unknown): void => {
      const location = gl.getUniformLocation(program, name);
      if (location === null) return;
      if (typeof value === 'number') gl.uniform1f(location, value);
      else if (Array.isArray(value)) {
        if (value.length === 2) gl.uniform2fv(location, value as number[]);
        else if (value.length === 3) gl.uniform3fv(location, value as number[]);
        else gl.uniform4fv(location, (value as number[]).slice(0, 4));
      }
    };
    setUniform('screenSize', [pixelW, pixelH]);
    setUniform('time', time);
    for (const [name, defaultValue] of this.shaderDefaults?.get(effect.shader) ?? []) {
      if (!(name in effect.vars)) setUniform(name, defaultValue);
    }
    const beat = this.chart!.bpmList.beat(time);
    let unit = 0;
    for (const [name, value] of Object.entries(effect.vars)) {
      const evaluated = this.eventValueAt(value, beat);
      if (typeof evaluated === 'string') {

        const location = gl.getUniformLocation(program, name);
        if (location !== null) {
          const image = this.chartAssets?.textures.get(evaluated);
          if (!image) continue;
          const texture = this.context.imageTexture(image);
          gl.activeTexture(gl.TEXTURE0 + ++unit); gl.bindTexture(gl.TEXTURE_2D, texture);
          gl.uniform1i(location, unit);
        }
      } else {
        /** RPE 四元变量为 RGBA 字节，GL 颜色使用 0–1。 */
        setUniform(name, Array.isArray(evaluated) && evaluated.length === 4
          ? evaluated.map(component => component / 255)
          : evaluated);
      }
    }
  }

  private prepareEffect(name: string): boolean {
    if (this.glPrograms.has(name)) return !!this.glPrograms.get(name);
    const source = this.chartAssets?.shaders.get(name);
    if (!source) return false;
    const gl = this.gl;
    if (!this.glQuad) {
      this.glQuad = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.glQuad);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    }
    const program = this.compileGlProgram(source);
    this.glPrograms.set(name, program);
    const defaults: [string, number | number[]][] = [];
    for (const match of source.matchAll(/uniform\s+(\w+)\s+(\w+);\s*\/\/\s*%([^%]+)%/g)) {
      defaults.push([match[2]!, match[1] === 'float' ? Number.parseFloat(match[3]!)
        : match[3]!.split(',').map(item => Number.parseFloat(item.trim()))]);
    }
    this.shaderDefaults.set(name, defaults);
    return !!program;
  }

  private compileGlProgram(fragmentSource: string): WebGLProgram | null {
    const gl = this.gl!;
    const compile = (type: number, source: string): WebGLShader | null => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('shader compile failed:', gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };
    const vertex = compile(gl.VERTEX_SHADER, GL_VERTEX_SHADER);
    const fragment = compile(gl.FRAGMENT_SHADER, transformForLoops(fragmentSource));
    if (!vertex || !fragment) {
      if (vertex) gl.deleteShader(vertex);
      if (fragment) gl.deleteShader(fragment);
      return null;
    }
    const program = gl.createProgram()!;
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('shader link failed:', gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      return null;
    }
    return program;
  }

}
