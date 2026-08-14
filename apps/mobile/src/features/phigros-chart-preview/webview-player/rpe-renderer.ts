/**
 * RPE 谱面 Canvas 渲染器，逐语义移植自 demo/phira-rpe-chart-preview/renderer.js，
 * 语义对照 refer/player-main（Line.ts/PlainNote.ts/LongNote.ts/Video.ts/Game.ts/ShaderPipeline.ts）
 * 与 refer/phira/prpr（RPE 路径）。接口与 PgrRenderer 对齐，供 main.ts 按谱面格式二选一。
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
  getIntegral,
} from './rpe-core';
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
  videos: Map<string, HTMLVideoElement>;
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
const HOLD_ATLAS: Readonly<{ normal: [number, number]; multi: [number, number] }> = Object.freeze({
  normal: [50, 50],
  multi: [96, 97],
});
const HIT_FX_DURATION = 0.5;
const HIT_FX_COLUMNS = 6;
const HIT_FX_ROWS = 5;
const HIT_FX_SCALE = 1;
const JUDGE_LINE_COLORS: Readonly<Record<string, string>> = Object.freeze({
  white: 'rgba(255, 255, 255, 1)',
  gold: 'rgba(255, 236, 159, 0.8823529412)',
  blue: 'rgba(180, 225, 255, 0.9215686275)',
});
const VISUAL_END_GRACE_SEC = 1;
const MAX_DRAW_DISTANCE_RATIO = 3;
const FADEOUT_TIME = 0.16; // prpr note.rs：show_below=false 线在击打前 0.16s 淡出
// 与 renderer.ts（PGR）一致的 DPR 封顶与全屏像素预算
const MAX_DPR = 2;
const FULLSCREEN_MIN_DPR = 1;
const FULLSCREEN_MAX_PIXELS = 2_500_000;

const GL_VERTEX_SHADER = `
attribute vec2 aPosition;
varying vec2 uv;
void main() {
  uv = vec2(aPosition.x * 0.5 + 0.5, 0.5 - aPosition.y * 0.5);
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// player-main ShaderPipeline.transformForLoops：把 GLSL for 循环展开为 WebGL1 可编译形式
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

// prpr parse_ctrl_events + Anim：ctrl 键帧（x 升序），区间 [kf_i, kf_{i+1}] 用事件 i+1 的缓动
function ctrlValue(control: readonly { x: number; easing: number; value: number }[], x: number): number {
  if (!control || control.length === 0) return 1;
  if (control.length === 1) return control[0]!.value;
  let index = 0;
  while (index < control.length - 2 && x > control[index + 1]!.x) index += 1;
  const kf1 = control[index]!;
  const kf2 = control[index + 1]!;
  if (kf2.x <= kf1.x) return kf2.value;
  const progress = easing(kf2.easing, undefined, (x - kf1.x) / (kf2.x - kf1.x));
  return kf1.value + (kf2.value - kf1.value) * progress;
}

// player-main Game.ts 的坐标换算
function p(position: number, width: number): number { return (position / 1350) * width; }
function o(offset: number, height: number): number { return (offset / 900) * height; }
function d(distance: number, height: number): number { return (distance * height * 2) / 15; }

function scaledNoteWidth(stageWidth: number, noteScale: number, multipleScale = 1): number {
  return stageWidth * NOTE_WIDTH_RATIO_BASE * clamp(noteScale, 0.5, 2) * multipleScale;
}

function scaledHitEffectDiameter(stageWidth: number, noteScale: number): number {
  return stageWidth * HIT_FX_SCALE * clamp(noteScale, 0.5, 2) / 5;
}

function lowerBoundBy<T>(items: readonly T[], target: number, read: (item: T) => number): number {
  let low = 0;
  let high = items.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (read(items[middle]!) < target) low = middle + 1;
    else high = middle;
  }
  return low;
}

function upperBoundBy<T>(items: readonly T[], target: number, read: (item: T) => number): number {
  let low = 0;
  let high = items.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (read(items[middle]!) <= target) low = middle + 1;
    else high = middle;
  }
  return low;
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

function tintTexture(image: HTMLImageElement, color: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d')!;
  context.drawImage(image, 0, 0);
  context.globalCompositeOperation = 'source-in';
  context.fillStyle = color;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.globalCompositeOperation = 'source-over';
  return canvas;
}

function particleAngle(seed: number, index: number): number {
  const mixed = Math.sin((seed * 17.17 + index * 31.73) * 12.9898) * 43758.5453;
  return (mixed - Math.floor(mixed)) * Math.PI * 2;
}

interface LineCursor {
  alpha: number[];
  x: number[];
  y: number[];
  rot: number[];
  speed: number[];
  lastHeight: number[];
  incline: number[];
  scaleX: number[];
  scaleY: number[];
  text: number[];
  color: number[];
  gif: { index: number };
  paint: number[];
}

interface NoteWindow {
  index: number;
  notes: RpeNote[];
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

  private readonly context: CanvasRenderingContext2D;
  private readonly resizeObserver: ResizeObserver;
  private readonly glCanvas: HTMLCanvasElement;
  private chart: RpeChart | null = null;
  private illustration: HTMLImageElement | null = null;
  private noteAssets: NoteAssets | null = null;
  private hitFxTexture: HTMLCanvasElement | null = null;
  private chartAssets: RpeChartAssets | null = null;
  private cursors: LineCursor[] = [];
  private activeWindows: NoteWindow[] = [];
  private hitEvents: HitEffectEvent[] = [];
  private effectCursors: Record<string, { index: number }>[] = [];
  private videoCursors: { alpha: { index: number }; dim: { index: number } }[] = [];
  private lastTime = Number.NaN;
  private settings: RpeRendererSettings = { noteScale: 1, multiHint: true, backgroundDim: 0.55, lineColor: 'white' };
  private fullscreen = false;
  private tintedTextures: WeakMap<object, Map<string, HTMLCanvasElement>> | null = null;
  private gl: WebGLRenderingContext | null = null;
  private glPrograms: Map<string, WebGLProgram> | null = null;
  private shaderDefaults: Map<string, [string, number | number[]][]> | null = null;
  private shaderTextures: Map<string, number> | null = null;
  private shaderTextureCount = 0;
  private glSourceTex: WebGLTexture | null = null;
  private glTexA: WebGLTexture | null = null;
  private glTexB: WebGLTexture | null = null;
  private glFboA: WebGLFramebuffer | null = null;
  private glFboB: WebGLFramebuffer | null = null;
  private glQuad: WebGLBuffer | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d', { alpha: false, desynchronized: true })!;
    this.glCanvas = document.createElement('canvas');
    this.glCanvas.className = 'gl-canvas';
    this.glCanvas.setAttribute('aria-hidden', 'true');
    canvas.parentElement?.insertBefore(this.glCanvas, canvas.nextSibling);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
  }

  setChart(chart: RpeChart): void {
    this.chart = chart;
    this.cursors = chart.lines.map(() => ({
      alpha: [], x: [], y: [], rot: [], speed: [], lastHeight: [],
      incline: [], scaleX: [], scaleY: [], text: [], color: [], gif: { index: 0 }, paint: [],
    }));
    this.hitEvents = buildHitEvents(chart);
    this.activeWindows = chart.lines.map(() => ({ index: 0, notes: [] }));
    this.effectCursors = chart.extras.effects.map(() => ({}));
    this.videoCursors = chart.extras.videos.map(() => ({ alpha: { index: 0 }, dim: { index: 0 } }));
    this.glPrograms = new Map();
    this.shaderDefaults = new Map();
    this.shaderTextures = new Map();
    this.shaderTextureCount = 0;
    this.resetTimeline(0);
  }

  setChartAssets(assets: RpeChartAssets): void { this.chartAssets = assets; }
  setIllustration(image: HTMLImageElement | null): void { this.illustration = image; }
  setNoteAssets(assets: NoteAssets): void {
    this.noteAssets = assets;
    this.hitFxTexture = assets.fx ? tintTexture(assets.fx, 'rgba(255, 236, 159, 0.8824)') : null;
  }

  setSettings(settings: RpeRendererSettings): void { this.settings = { ...this.settings, ...settings }; }

  setFullscreen(active: boolean): void {
    if (this.fullscreen === active) return;
    this.fullscreen = active;
    this.resize();
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const rawDpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    let dpr = rawDpr;
    if (this.fullscreen) {
      const area = Math.max(1, rect.width * rect.height);
      const budgetDpr = Math.sqrt(FULLSCREEN_MAX_PIXELS / area);
      dpr = Math.min(rawDpr, Math.max(FULLSCREEN_MIN_DPR, budgetDpr));
    }
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  resetTimeline(time: number): void {
    if (!this.chart) return;
    this.lastTime = time;
    for (let lineIndex = 0; lineIndex < this.chart.lines.length; lineIndex += 1) {
      const line = this.chart.lines[lineIndex]!;
      const cursor = this.cursors[lineIndex]!;
      cursor.alpha = []; cursor.x = []; cursor.y = []; cursor.rot = [];
      cursor.speed = []; cursor.lastHeight = []; cursor.incline = [];
      cursor.scaleX = []; cursor.scaleY = []; cursor.text = [];
      cursor.color = []; cursor.gif = { index: 0 }; cursor.paint = [];
      const window = this.activeWindows[lineIndex]!;
      window.index = 0;
      window.notes = [];
      while (window.index < line.notes.length && line.notes[window.index]!.hitTime - line.notes[window.index]!.visibleTime <= time) {
        const note = line.notes[window.index]!;
        if (note.endHitTime + VISUAL_END_GRACE_SEC >= time) window.notes.push(note);
        window.index += 1;
      }
    }
    for (let effectIndex = 0; effectIndex < this.effectCursors.length; effectIndex += 1) {
      this.effectCursors[effectIndex] = {};
    }
    for (let videoIndex = 0; videoIndex < this.videoCursors.length; videoIndex += 1) {
      this.videoCursors[videoIndex] = { alpha: { index: 0 }, dim: { index: 0 } };
    }
  }

  // ---- 事件求值（player-main Line.ts handleEvent/handleSpeed 语义） ----
  private handleEvent(
    beat: number,
    layerIndex: number,
    events: readonly RpeEvent[],
    cur: number[],
    fillInBetween = true,
  ): unknown {
    while (cur.length < layerIndex + 1) cur.push(0);
    if (events && events.length > 0) {
      if (cur[layerIndex]! > 0 && beat <= events[cur[layerIndex]!]!.startBeat) cur[layerIndex] = 0;
      while (cur[layerIndex]! < events.length - 1 && beat > events[cur[layerIndex]! + 1]!.startBeat) cur[layerIndex] = (cur[layerIndex] ?? 0) + 1;
      if (!fillInBetween && (beat <= events[cur[layerIndex]!]!.startBeat || beat > events[cur[layerIndex]!]!.endBeat)) {
        return undefined;
      }
      return getEventValue(events[cur[layerIndex]!]!, beat, this.chart!.bpmList);
    }
    return undefined;
  }

  private handleSpeed(
    beat: number,
    layerIndex: number,
    events: readonly RpeEvent[],
    cur: number[],
    lastHeight: number[],
  ): number {
    while (cur.length < layerIndex + 1) cur.push(0);
    while (lastHeight.length < layerIndex + 1) lastHeight.push(0);
    if (events && events.length > 0) {
      if (cur[layerIndex]! > 0 && beat <= events[cur[layerIndex]!]!.startBeat) {
        cur[layerIndex] = 0;
        lastHeight[layerIndex] = 0;
      }
      while (cur[layerIndex]! < events.length - 1 && beat > events[cur[layerIndex]! + 1]!.startBeat) {
        lastHeight[layerIndex] =
          (lastHeight[layerIndex] ?? 0) +
          getIntegral(events[cur[layerIndex]!]!, this.chart!.bpmList, this.lineIntegrateEasings(layerIndex)) +
          (events[cur[layerIndex]!]!.end as number) *
            (this.chart!.bpmList.timeSec(events[cur[layerIndex]! + 1]!.startBeat) -
              this.chart!.bpmList.timeSec(events[cur[layerIndex]!]!.endBeat));
        cur[layerIndex] = (cur[layerIndex] ?? 0) + 1;
      }
      let height = lastHeight[layerIndex] ?? 0;
      if (beat <= events[cur[layerIndex]!]!.endBeat) {
        height += getIntegral(events[cur[layerIndex]!]!, this.chart!.bpmList, this.lineIntegrateEasings(layerIndex), beat);
      } else {
        height +=
          getIntegral(events[cur[layerIndex]!]!, this.chart!.bpmList, this.lineIntegrateEasings(layerIndex)) +
          (events[cur[layerIndex]!]!.end as number) *
            (this.chart!.bpmList.timeSec(beat) - this.chart!.bpmList.timeSec(events[cur[layerIndex]!]!.endBeat));
      }
      return height;
    }
    return 0;
  }

  private lineIntegrateEasings(lineIndex: number): boolean {
    return this.chart!.lines[lineIndex]!.integrateSpeedEasings;
  }

  // ---- 判定线状态（含父级组合） ----
  private lineState(lineIndex: number, time: number, width: number, height: number): Omit<LineState, 'cos' | 'sin' | 'screenX' | 'screenY'> {
    const line = this.chart!.lines[lineIndex]!;
    const cursor = this.cursors[lineIndex]!;
    const beat = this.chart!.bpmList.beat(time);
    let alpha = 0;
    let x = 0;
    let y = 0;
    let rot = 0;
    let lineHeight = 0;
    for (let layerIndex = 0; layerIndex < line.eventLayers.length; layerIndex += 1) {
      const layer = line.eventLayers[layerIndex]!;
      alpha += (this.handleEvent(beat / line.bpmfactor, layerIndex, layer.alphaEvents, cursor.alpha) as number) ?? 0;
      x += (this.handleEvent(beat / line.bpmfactor, layerIndex, layer.moveXEvents, cursor.x) as number) ?? 0;
      y += (this.handleEvent(beat / line.bpmfactor, layerIndex, layer.moveYEvents, cursor.y) as number) ?? 0;
      rot += (this.handleEvent(beat / line.bpmfactor, layerIndex, layer.rotateEvents, cursor.rot) as number) ?? 0;
      lineHeight += this.handleSpeed(beat / line.bpmfactor, layerIndex, layer.speedEvents, cursor.speed, cursor.lastHeight);
    }
    const incline = (this.handleEvent(beat / line.bpmfactor, 0, line.inclineEvents, cursor.incline) as number) ?? 0;
    const scaleXValue = (this.handleEvent(beat / line.bpmfactor, 0, line.scaleXEvents, cursor.scaleX) as number) ?? 1;
    const scaleYValue = (this.handleEvent(beat / line.bpmfactor, 0, line.scaleYEvents, cursor.scaleY) as number) ?? 1;
    const textValue = this.handleEvent(beat / line.bpmfactor, 0, line.textEvents, cursor.text);
    const colorValue = this.handleEvent(beat / line.bpmfactor, 0, line.colorEvents, cursor.color);
    const gif = this.gifValue(this.chartAssets?.gifAnims.get(lineIndex) ?? [], time, cursor.gif);
    const paintValue = this.handleEvent(beat / line.bpmfactor, 0, line.paintEvents, cursor.paint) as number | null | undefined;
    // prpr：RPE 负 alpha（pe_alpha_extension 仅 PEC 启用）＝整线连同音符隐藏
    const alphaExt = alpha < 0 ? 1 : 0;
    // prpr rpe.rs：show_below = is_cover != 1（isCover 线只画线上方）
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

  private worldState(lineIndex: number, time: number, width: number, height: number): LineState {
    const line = this.chart!.lines[lineIndex]!;
    const state = this.lineState(lineIndex, time, width, height);
    if (line.parent !== null && line.parent !== undefined) {
      const parent = this.worldState(line.parent, time, width, height);
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
      return {
        ...state,
        rotDeg: totalRot,
        cos: Math.cos(rad),
        sin: Math.sin(rad),
        screenX: nx + width / 2,
        screenY: ny + height / 2,
      };
    }
    const rad = (state.rotDeg * Math.PI) / 180;
    return {
      ...state,
      cos: Math.cos(rad),
      sin: Math.sin(rad),
      screenX: p(state.moveX, width) + width / 2,
      screenY: o(-state.moveY, height) + height / 2,
    };
  }

  // ---- 音符 ----
  private advanceActiveNotes(lineIndex: number, time: number): void {
    const line = this.chart!.lines[lineIndex]!;
    const window = this.activeWindows[lineIndex]!;
    while (window.index < line.notes.length && line.notes[window.index]!.hitTime - line.notes[window.index]!.visibleTime <= time) {
      const note = line.notes[window.index]!;
      if (note.endHitTime + VISUAL_END_GRACE_SEC >= time) window.notes.push(note);
      window.index += 1;
    }
    window.notes = window.notes.filter((note) => note.endHitTime + VISUAL_END_GRACE_SEC >= time);
  }

  private drawNotes(context: CanvasRenderingContext2D, lineIndex: number, state: LineState, time: number): void {
    this.advanceActiveNotes(lineIndex, time);
    const window = this.activeWindows[lineIndex]!;
    for (const kind of ['hold', 'drag', 'tap', 'flick'] as const) {
      for (const note of window.notes) {
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
    // autoplay：普通音符击打即消失（player-main 判定后语义），Hold 持续到尾部
    if (note.kind !== 'hold' && time >= note.hitTime) return false;
    const line = state.line;
    // prpr CtrlObject：ctrl 键帧以 chartDist（×RPE_HEIGHT/2）为 x 轴求值
    const ctrlX = (note.headHeight - state.lineHeight + note.yOffsetRaw / note.speed) * 450;
    const ctrlAlpha = ctrlValue(line.alphaControl, ctrlX);
    const ctrlSize = ctrlValue(line.sizeControl, ctrlX);
    const ctrlPos = ctrlValue(line.posControl, ctrlX);
    const ctrlY = ctrlValue(line.yControl, ctrlX);
    const effectiveSpeed = note.speed * ctrlY;
    const direction = note.above ? -1 : 1;
    // 到判定线的无符号谱面距离（player-main PlainNote.update 的 dist，含 yOffset）
    const headDist = d((note.headHeight - state.lineHeight) * effectiveSpeed, state.height) + o(note.yOffset, state.height);
    if (Math.abs(headDist) > state.height * MAX_DRAW_DISTANCE_RATIO) return false;
    const chartDist = (headDist / state.height) * 900;
    const inclineShift = Math.tan(((note.positionX / 675) * -state.incline * Math.PI) / 180) * chartDist;
    const along = p(note.positionX + inclineShift, state.width) * ctrlPos;
    const isMulti = this.settings.multiHint && note.multipleHint;
    const style = isMulti ? this.noteAssets!.multi : this.noteAssets!.normal;
    const multipleScale = isMulti ? style[note.kind].naturalWidth / this.noteAssets!.normal[note.kind].naturalWidth : 1;
    // prpr note.rs：宽度随 size×ctrlSize；高度仅 noteUniformScale 时随（Hold 头/尾高度始终不随）
    const baseNoteWidth = scaledNoteWidth(state.width, this.settings.noteScale ?? 1, multipleScale);
    const noteWidth = baseNoteWidth * note.size * ctrlSize;
    const noteHeightFactor = this.chart!.info.noteUniformScale === true ? note.size * ctrlSize : 1;
    context.save();
    context.translate(state.screenX, state.screenY);
    context.rotate(Math.atan2(state.sin, state.cos));
    context.translate(along, 0);
    context.scale(1, direction);
    if (note.kind === 'hold') {
      // prpr note.rs：show_below=false（isCover）且未到击打时，反向（头在线下）隐藏；holdPartialCover 时按尾距离判定
      const coverDist = this.chart!.info.holdPartialCover === true
        ? (note.tailHeight - state.lineHeight) * effectiveSpeed
        : (note.headHeight - state.lineHeight) * effectiveSpeed;
      if (!state.drawBelow && time < note.hitTime && coverDist < 0) {
        context.restore();
        return false;
      }
      const tailDist = d((note.tailHeight - state.lineHeight) * effectiveSpeed, state.height) + o(note.yOffset, state.height);
      // 头过线后头贴判定线（prpr：bottom = 0），body/tail 持续到尾部
      const bottom = time >= note.hitTime ? o(note.yOffset, state.height) : headDist;
      const top = tailDist;
      if (top <= bottom) {
        context.restore();
        return false;
      }
      context.globalAlpha = note.alpha / 255 * ctrlAlpha;
      const holdImage = this.tintedCanvas(style.hold, note.tint);
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
      // show_below=false（isCover）：击打前 0.16s 淡出（prpr FADEOUT_TIME），反向（头在线下）隐藏
      let alpha = note.alpha / 255 * ctrlAlpha;
      if (!state.drawBelow) {
        if ((note.headHeight - state.lineHeight) * effectiveSpeed < 0) {
          context.restore();
          return false;
        }
        alpha *= Math.max(0, 1 + Math.min(0, note.hitTime - time) / FADEOUT_TIME);
      }
      context.globalAlpha = alpha;
      const image = this.tintedCanvas(style[note.kind], note.tint);
      // 注意：tintedCanvas 可能返回 canvas（无 naturalWidth/naturalHeight），统一用 width/height 回退
      const imageWidth = image.width ?? image.naturalWidth;
      const imageHeight = image.height ?? image.naturalHeight;
      const noteHeight = baseNoteWidth * noteHeightFactor * imageHeight / imageWidth;
      drawTextureFlippedY(context, image, null, [-noteWidth / 2, headDist - noteHeight / 2, noteWidth, noteHeight]);
    }
    context.restore();
    return true;
  }

  private tintedCanvas(image: CanvasImageSource, tint: [number, number, number] | null): CanvasImageSource {
    // 白色 tint 与原图逐像素一致，直接返回原图（prpr WHITE 语义）
    if (!tint || (tint[0] === 255 && tint[1] === 255 && tint[2] === 255)) return image;
    // 缓存按「图片身份 × 颜色」键控（WeakMap 以 image 为键，避免不同贴图共用同一颜色缓存）
    let cache = this.tintedTextures;
    if (!cache) {
      cache = new WeakMap();
      this.tintedTextures = cache;
    }
    let perImage = cache.get(image as object);
    if (!perImage) {
      perImage = new Map();
      cache.set(image as object, perImage);
    }
    const key = `${tint.join(',')}`;
    let canvas = perImage.get(key);
    const source = image as CanvasImageSource & { naturalWidth?: number; naturalHeight?: number };
    const imageWidth = (image as { width?: number }).width ?? source.naturalWidth ?? 0;
    const imageHeight = (image as { height?: number }).height ?? source.naturalHeight ?? 0;
    if (!canvas || canvas.width !== imageWidth || canvas.height !== imageHeight) {
      canvas = document.createElement('canvas');
      canvas.width = imageWidth;
      canvas.height = imageHeight;
      const tintContext = canvas.getContext('2d')!;
      tintContext.drawImage(image, 0, 0);
      // prpr 颜色语义为逐通道相乘：multiply 后必须用 destination-in 恢复原 alpha，
      // 否则透明区域会变成不透明的 tint 色（白色实块）
      tintContext.globalCompositeOperation = 'multiply';
      tintContext.fillStyle = `rgb(${tint[0]},${tint[1]},${tint[2]})`;
      tintContext.fillRect(0, 0, canvas.width, canvas.height);
      tintContext.globalCompositeOperation = 'destination-in';
      tintContext.drawImage(image, 0, 0);
      perImage.set(key, canvas);
    }
    return canvas;
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
    // prpr LongNote.resize：body 宽随 size，头/尾高度按基础宽度（不随 size）
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

  // ---- 渲染 ----
  private gifValue(animKfs: readonly RpeGifKeyframe[], timeSec: number, cursor: { index: number }): number {
    if (!animKfs || animKfs.length === 0) return 0;
    if (cursor.index > 0 && timeSec <= animKfs[cursor.index]!.t) cursor.index = 0;
    while (cursor.index < animKfs.length - 1 && timeSec > animKfs[cursor.index + 1]!.t) cursor.index += 1;
    const kf1 = animKfs[cursor.index]!;
    if (cursor.index >= animKfs.length - 1) return kf1.v;
    const kf2 = animKfs[cursor.index + 1]!;
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
    context.drawImage(this.tintedCanvas(image, tint), x, y, width, height);
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
        // prpr JudgeLineKind::Paint：值>0 时在判定线处画填充圆（半径 = 值×播放区宽/窗口宽）
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
        // player-main：文本事件替换判定线视觉（白色/colorEvents 色、p(100) 字号、居中、随线旋转）
        context.fillStyle = tintStyle ?? '#ffffff';
        context.font = `${p(100, state.width)}px system-ui, -apple-system, "Segoe UI", "Microsoft YaHei UI", sans-serif`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(state.text, 0, 0);
        context.restore();
        return;
      }
      // 默认判定线：lineLength/2 × 播放区宽（prpr draw_line(−len, 0, len, 0)）
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
    // 自定义贴图判定线（prpr JudgeLineKind::Texture / TextureGif）
    const gifData = line.gifEvents.length > 0 ? this.chartAssets?.gifs.get(line.texture) : undefined;
    const staticImage = gifData ? undefined : this.chartAssets?.textures.get(line.texture);
    if (gifData?.frames.length) {
      const progress = clamp(state.gif, 0, 1);
      const elapsed = progress * gifData.totalMs;
      let frame = gifData.frames[0]!;
      for (let i = 0; i < gifData.frames.length; i += 1) {
        if (elapsed <= gifData.cumulativeMs[i]! || i === gifData.frames.length - 1) {
          frame = gifData.frames[i]!;
          break;
        }
      }
      const unit = state.width / 1350;
      const drawWidth = frame.width * unit * state.scaleX;
      const drawHeight = frame.height * unit * state.scaleY;
      this.drawTintedImage(context, frame, tint, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
      context.restore();
      return;
    }
    if (staticImage?.naturalWidth) {
      // player-main：自定义贴图按自然尺寸 × width/1350 × scaleX/scaleY 绘制
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

  render(time: number): void {
    const context = this.context;
    const pixelWidth = this.canvas.width;
    const pixelHeight = this.canvas.height;
    const ratio = pixelWidth / Math.max(1, this.canvas.clientWidth);
    const width = pixelWidth / ratio;
    const height = pixelHeight / ratio;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.globalAlpha = 1;
    context.fillStyle = '#000000';
    context.fillRect(0, 0, width, height);

    if (!this.chart) return;
    this.lastVisitedNotes = 0;
    this.lastDrawnNotes = 0;
    this.lastNotesOnHiddenLines = 0;
    if (!Number.isFinite(this.lastTime) || time < this.lastTime || time - this.lastTime > 0.35) this.resetTimeline(time);

    // 播放区按有效宽高比 letterbox（prpr resource.rs viewport 语义）：
    // 比例 = 用户覆盖 ?? (forceAspectRatio ? info : min(info, 窗口)) ?? 窗口；谱面 1350×900 完整映射进播放区
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
      // prpr flip_x：播放区 X 镜像
      context.translate(boxWidth, 0);
      context.scale(-1, 1);
    }
    drawCover(context, this.illustration, boxWidth, boxHeight);
    context.fillStyle = `rgba(4, 3, 8, ${clamp(this.settings.backgroundDim ?? 0.55, 0, 1)})`;
    context.fillRect(0, 0, boxWidth, boxHeight);

    const states: LineState[] = [];
    const drawOrder = this.chart.lines
      .map((line, index) => ({ line, index }))
      .sort((a, b) => a.line.zIndex - b.line.zIndex)
      .map(({ index }) => index);
    for (let lineIndex = 0; lineIndex < this.chart.lines.length; lineIndex += 1) {
      states.push(this.worldState(lineIndex, time, boxWidth, boxHeight));
    }
    // 视频：depth 1，在判定线（depth ≥ 2）之下（player-main Video.setDepth(zIndex ?? 1)）
    this.drawVideos(context, time, boxWidth, boxHeight);
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
    // attachUI：HUD 元素跟随判定线变换（prpr Chart::with_element：位置/旋转/缩放/透明度/颜色）
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
    this.lastTime = time;
    this.lastRenderedTime = time;
    this.maxVisitedNotes = Math.max(this.maxVisitedNotes, this.lastVisitedNotes);
    this.maxNotesOnHiddenLines = Math.max(this.maxNotesOnHiddenLines, this.lastNotesOnHiddenLines);
    this.renderEffectPasses(time, width, height);
  }

  private drawHitEffects(context: CanvasRenderingContext2D, time: number, width: number, height: number): void {
    this.lastRenderedEffects = 0;
    if (!this.hitFxTexture || !this.hitEvents.length) return;
    const first = lowerBoundBy(this.hitEvents, time - HIT_FX_DURATION, (effect) => effect.time);
    const end = upperBoundBy(this.hitEvents, time, (effect) => effect.time);
    const frameWidth = this.hitFxTexture.width / HIT_FX_COLUMNS;
    const frameHeight = this.hitFxTexture.height / HIT_FX_ROWS;
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
      const fx = effect.note.tintHitEffects ? (this.tintedCanvas(this.hitFxTexture, effect.note.tintHitEffects) as HTMLCanvasElement) : this.hitFxTexture;
      context.drawImage(
        fx,
        frame % HIT_FX_COLUMNS * frameWidth,
        Math.floor(frame / HIT_FX_COLUMNS) * frameHeight,
        frameWidth,
        frameHeight,
        x - size / 2,
        y - size / 2,
        size,
        size,
      );
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

  // ---- 视频（player-main Video.ts 语义） ----
  private eventValueAt(value: unknown, beat: number, cursor: { index: number }): unknown {
    // 常量（数值/数组）原样返回；事件列表按游标求值（数组值逐分量插值）
    if (!Array.isArray(value) || !value[0] || !('startBeat' in (value[0] as object))) return value;
    const events = value as RpeEvent[];
    if (cursor.index > 0 && beat <= events[cursor.index]!.startBeat) cursor.index = 0;
    while (cursor.index < events.length - 1 && beat > events[cursor.index + 1]!.startBeat) cursor.index += 1;
    return getEventValue(events[cursor.index]!, beat, this.chart!.bpmList);
  }

  private drawVideos(context: CanvasRenderingContext2D, time: number, width: number, height: number): void {
    const videos = this.chart?.extras.videos ?? [];
    for (let index = 0; index < videos.length; index += 1) {
      this.drawVideo(context, videos[index]!, index, time, width, height);
    }
  }

  private drawVideo(context: CanvasRenderingContext2D, video: RpeVideo, index: number, time: number, width: number, height: number): void {
    const element = this.chartAssets?.videos.get(video.path);
    if (!element) return;
    const duration = Number.isFinite(element.duration) && element.duration > 0 ? element.duration : 0;
    const endSec = video.startTimeSec + duration;
    if (duration <= 0 || time < video.startTimeSec || time >= endSec) {
      if (!element.paused) element.pause();
      return;
    }
    const beat = this.chart!.bpmList.beat(time);
    let alpha = this.eventValueAt(video.alpha, beat, this.videoCursors[index]!.alpha) as number | number[] | string;
    const dim = this.eventValueAt(video.dim, beat, this.videoCursors[index]!.dim) as number | number[] | string;
    // 进度同步（player-main：startTimeSec 起播、结束后回 0）
    const local = time - video.startTimeSec;
    if (Math.abs(element.currentTime - local) > 0.25) {
      try { element.currentTime = local; } catch { /* 未缓冲到位时忽略，下一帧重试 */ }
    }
    if (element.paused) element.play().catch(() => { /* 自动播放受限时静默 */ });
    const vw = element.videoWidth;
    const vh = element.videoHeight;
    if (!vw || !vh) return;
    // 变换：attach 在判定线模型内渲染（prpr chart.rs/video.rs），否则屏幕居中
    let cx = width / 2;
    let cy = height / 2;
    let rot = 0;
    if (video.attach) {
      const state = this.worldState(video.attach.line, time, width, height);
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
      // player-main：与视频同区域的黑色遮罩，alpha = dim
      context.save();
      context.translate(cx, cy);
      context.rotate(rot);
      context.globalAlpha = clamp(Number(dim) || 0, 0, 1);
      context.fillStyle = '#000000';
      context.fillRect(-drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
      context.restore();
    }
  }

  // ---- 全屏 shader 特效后处理（prpr/player-main effects：整幅画面逐 effect 过 shader） ----
  private renderEffectPasses(time: number, width: number, height: number): void {
    const effects = this.settings.effects === false
      ? []
      : (this.chart?.extras.effects ?? []).filter(
        (effect) =>
          time >= this.chart!.bpmList.timeSec(effect.startBeat) &&
          time < this.chart!.bpmList.timeSec(effect.endBeat) &&
          this.chartAssets?.shaders.has(effect.shader),
      );
    this.effectsActive = effects.length;
    if (effects.length === 0) {
      if (this.glCanvas.style.display !== 'none') this.glCanvas.style.display = 'none';
      return;
    }
    if (!this.prepareGl()) {
      this.effectsActive = 0;
      return;
    }
    const gl = this.gl!;
    const pixelW = this.canvas.width;
    const pixelH = this.canvas.height;
    // 上传 2D 画面作为第一个 pass 的输入
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.bindTexture(gl.TEXTURE_2D, this.glSourceTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.canvas);
    let source: WebGLTexture | null = this.glSourceTex;
    for (let index = 0; index < effects.length; index += 1) {
      const effect = effects[index]!;
      const last = index === effects.length - 1;
      const target = last ? null : (index % 2 === 0 ? this.glFboA : this.glFboB);
      const targetTex = last ? null : (index % 2 === 0 ? this.glTexA : this.glTexB);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target);
      gl.viewport(0, 0, pixelW, pixelH);
      const program = this.glPrograms?.get(effect.shader);
      if (!program) continue;
      gl.useProgram(program);
      this.applyEffectUniforms(gl, program, effect, time, pixelW, pixelH);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, source);
      gl.uniform1i(gl.getUniformLocation(program, 'screenTexture'), 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.glQuad);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      source = targetTex;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.glCanvas.style.display = 'block'; // CSS 默认 display:none，需显式覆盖
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
    const effectIndex = this.chart!.extras.effects.indexOf(effect);
    const cursor = this.effectCursors[effectIndex] ?? {};
    for (const [name, value] of Object.entries(effect.vars)) {
      const evaluated = this.eventValueAt(value, beat, cursor[name] ??= { index: 0 });
      if (typeof evaluated === 'string') {
        // sampler2D uniform：字符串值引用谱面图片纹理
        const location = gl.getUniformLocation(program, name);
        if (location !== null) {
          const unit = this.bindShaderTexture(evaluated, gl);
          if (unit >= 0) gl.uniform1i(location, unit);
        }
      } else {
        setUniform(name, evaluated);
      }
    }
  }

  private bindShaderTexture(name: string, gl: WebGLRenderingContext): number {
    let cache = this.shaderTextures;
    if (!cache) {
      cache = new Map();
      this.shaderTextures = cache;
    }
    const cached = cache.get(name);
    if (cached !== undefined) return cached;
    const image = this.chartAssets?.textures.get(name);
    if (!image) return -1;
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    this.shaderTextureCount += 1;
    const unit = this.shaderTextureCount;
    cache.set(name, unit);
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    return unit;
  }

  private prepareGl(): boolean {
    if (!this.gl) {
      this.gl = this.glCanvas.getContext('webgl', {
        alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false,
      });
      if (!this.gl) return false;
      this.glPrograms = new Map();
      this.shaderDefaults = new Map();
    }
    const gl = this.gl;
    const pixelW = this.canvas.width;
    const pixelH = this.canvas.height;
    if (this.glCanvas.width !== pixelW || this.glCanvas.height !== pixelH) {
      this.glCanvas.width = pixelW;
      this.glCanvas.height = pixelH;
      this.disposeGlTargets();
      this.glSourceTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.glSourceTex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, pixelW, pixelH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      const makeTarget = (): { tex: WebGLTexture; fbo: WebGLFramebuffer } => {
        const tex = gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, pixelW, pixelH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        const fbo = gl.createFramebuffer()!;
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        return { tex, fbo };
      };
      const a = makeTarget();
      const b = makeTarget();
      this.glTexA = a.tex;
      this.glFboA = a.fbo;
      this.glTexB = b.tex;
      this.glFboB = b.fbo;
      this.glQuad = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.glQuad);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    }
    // 编译缺失的 shader 程序，并解析 shader 声明的默认 uniform（// %值% 注释，player-main DEFAULT_VALUE_REGEX）
    for (const [name, source] of this.chartAssets?.shaders ?? []) {
      if (this.glPrograms!.has(name)) continue;
      const program = this.compileGlProgram(source);
      if (!program) continue;
      this.glPrograms!.set(name, program);
      const defaults: [string, number | number[]][] = [];
      for (const match of source.matchAll(/uniform\s+(\w+)\s+(\w+);\s*\/\/\s*%([^%]+)%/g)) {
        const type = match[1]!;
        const uniformName = match[2]!;
        const raw = match[3]!;
        if (type === 'float') defaults.push([uniformName, Number.parseFloat(raw)]);
        else defaults.push([uniformName, raw.split(',').map((item) => Number.parseFloat(item.trim()))]);
      }
      this.shaderDefaults!.set(name, defaults);
    }
    return this.glPrograms!.size > 0;
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
    if (!vertex || !fragment) return null;
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

  private disposeGlTargets(): void {
    const gl = this.gl;
    if (!gl) return;
    for (const target of [this.glSourceTex, this.glTexA, this.glTexB]) {
      if (target) gl.deleteTexture(target);
    }
    for (const fbo of [this.glFboA, this.glFboB]) {
      if (fbo) gl.deleteFramebuffer(fbo);
    }
    if (this.glQuad) gl.deleteBuffer(this.glQuad);
    this.glSourceTex = null;
    this.glTexA = null;
    this.glTexB = null;
    this.glFboA = null;
    this.glFboB = null;
    this.glQuad = null;
  }
}
