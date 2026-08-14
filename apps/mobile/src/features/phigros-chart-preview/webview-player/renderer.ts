/**
 * Phigros PGR Canvas 渲染器，移植自 demo/phigros-chart-preview/renderer.js。
 * 固定使用内置皮肤（Tap2/Drag/Flick2/Hold2 及 HL 变体、hit.png），
 * 图集参数硬编码 hit: 6×5、普通 Hold 50/50、高亮 Hold 96/97、hitfx 1。
 */

import { findEventIndex, type PgrChart, type PgrHeightEvent, type PgrLine, type PgrMoveEvent, type PgrNote, type PgrTweenEvent } from './pgr-core';

const NOTE_WIDTH_RATIO_BASE = 0.13175016;
const HOLD_ATLAS = Object.freeze({ normal: [50, 50], multi: [96, 97] });
const HOLD_PARTICLE_INTERVAL = 0.15;
const HIT_FX_DURATION = 0.5;
const HIT_FX_COLUMNS = 6;
const HIT_FX_ROWS = 5;
const HIT_FX_SCALE = 1;
const JUDGE_LINE_COLORS: Readonly<Record<string, string>> = Object.freeze({
  white: 'rgba(255, 255, 255, 1)',
  gold: 'rgba(255, 236, 159, 0.8823529412)',
  blue: 'rgba(180, 225, 255, 0.9215686275)',
});
/** 与舞萌渲染器一致：DPR=3 设备封顶 2，节省约 56% 像素。 */
const MAX_DPR = 2;
const FULLSCREEN_MIN_DPR = 1;
/** 与舞萌渲染器一致的全屏总像素预算，避免大屏合成顶满 vsync 预算。 */
const FULLSCREEN_MAX_PIXELS = 2_500_000;

export type LineColorKey = 'white' | 'gold' | 'blue';
export type NoteKindKey = 'tap' | 'drag' | 'flick' | 'hold';

export interface RendererSettings {
  noteScale: number;
  multiHint: boolean;
  backgroundDim: number;
  lineColor: LineColorKey;
}

interface LineRenderCache {
  holds: PgrNote[];
  groups: { above: boolean; speed: number; notes: PgrNote[] }[];
}

interface LineCursor { speed: number; disappear: number; rotate: number; move: number }

interface LineState {
  x: number;
  y: number;
  cos: number;
  sin: number;
  lineHeight: number;
  width: number;
  height: number;
  lineAlpha: number;
}

interface HitEffectEvent { time: number; lineIndex: number; note: PgrNote; seed: number }

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

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

function sampleTweenAt(events: PgrTweenEvent[], time: number, index: number, fallback = 0): number {
  if (!events.length || index < 0) return fallback;
  const event = events[index]!;
  if (time <= event[0]) return event[2];
  if (time >= event[1] || event[1] === event[0]) return event[3];
  const progress = (time - event[0]) / (event[1] - event[0]);
  return event[2] + (event[3] - event[2]) * progress;
}

function sampleMoveAt(events: PgrMoveEvent[], time: number, index: number): [number, number] {
  if (!events.length || index < 0) return [0, 0];
  const event = events[index]!;
  if (time <= event[0]) return [event[2], event[3]];
  if (time >= event[1] || event[1] === event[0]) return [event[4], event[5]];
  const progress = (time - event[0]) / (event[1] - event[0]);
  return [event[2] + (event[4] - event[2]) * progress, event[3] + (event[5] - event[3]) * progress];
}

function sampleHeightAt(events: PgrHeightEvent[], time: number, index: number): number {
  if (!events.length || index < 0) return 0;
  const event = events[index]!;
  if (time <= event[0]) return event[3];
  if (time <= event[1]) return event[3] + (time - event[0]) * event[2] / 0.83175;
  if (index === events.length - 1) return event[4];
  return event[4];
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
  image: HTMLImageElement,
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

function createLineRenderCache(line: PgrLine): LineRenderCache {
  const holds: PgrNote[] = [];
  const groups = new Map<string, { above: boolean; speed: number; notes: PgrNote[] }>();
  for (const note of line.notes) {
    if (note.kind === 'hold') {
      holds.push(note);
      continue;
    }
    const key = `${note.above ? 1 : 0}:${note.speed}`;
    if (!groups.has(key)) groups.set(key, { above: note.above, speed: note.speed, notes: [] });
    groups.get(key)!.notes.push(note);
  }
  for (const group of groups.values()) group.notes.sort((a, b) => a.height - b.height || a.time - b.time);
  return { holds, groups: [...groups.values()] };
}

function buildHitEvents(chart: PgrChart): HitEffectEvent[] {
  const effects: HitEffectEvent[] = [];
  let seed = 0;
  chart.lines.forEach((line, lineIndex) => {
    line.notes.forEach((note) => {
      effects.push({ time: note.time, lineIndex, note, seed: seed += 1 });
      if (note.kind === 'hold') {
        for (let time = note.time + HOLD_PARTICLE_INTERVAL; time < note.endTime - 1e-8; time += HOLD_PARTICLE_INTERVAL) {
          effects.push({ time, lineIndex, note, seed: seed += 1 });
        }
      }
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

export interface NoteAssets {
  normal: Record<NoteKindKey, HTMLImageElement>;
  multi: Record<NoteKindKey, HTMLImageElement>;
  fx: HTMLImageElement;
}

export class PgrRenderer {
  readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly resizeObserver: ResizeObserver;
  private chart: PgrChart | null = null;
  private illustration: HTMLImageElement | null = null;
  private noteAssets: NoteAssets | null = null;
  private hitFxTexture: HTMLCanvasElement | null = null;
  private cursors: LineCursor[] = [];
  private renderCaches: LineRenderCache[] = [];
  private hitEvents: HitEffectEvent[] = [];
  private lastTime = Number.NaN;
  private settings: RendererSettings = { noteScale: 1, multiHint: true, backgroundDim: 0.55, lineColor: 'white' };
  private fullscreen = false;
  lastRenderedTime = 0;
  lastVisitedNotes = 0;
  maxVisitedNotes = 0;
  lastDrawnNotes = 0;
  lastRenderedEffects = 0;
  lastMaxFutureLead = 0;
  maxFutureLead = 0;
  lastNotesOnHiddenLines = 0;
  maxNotesOnHiddenLines = 0;
  lastHitEffectDiameter = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d', { alpha: false, desynchronized: true })!;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
  }

  setChart(chart: PgrChart): void {
    this.chart = chart;
    this.cursors = chart.lines.map(() => ({ speed: 0, disappear: 0, rotate: 0, move: 0 }));
    this.renderCaches = chart.lines.map(createLineRenderCache);
    this.hitEvents = buildHitEvents(chart);
    this.resetTimeline(0);
  }

  setIllustration(image: HTMLImageElement | null): void { this.illustration = image; }

  setNoteAssets(assets: NoteAssets): void {
    this.noteAssets = assets;
    this.hitFxTexture = assets.fx ? tintTexture(assets.fx, 'rgba(255, 236, 159, 0.8824)') : null;
  }

  setSettings(settings: Partial<RendererSettings>): void { this.settings = { ...this.settings, ...settings }; }

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
    this.chart.lines.forEach((line, lineIndex) => {
      const cursor = this.cursors[lineIndex]!;
      cursor.speed = findEventIndex(line.speedEvents, time);
      cursor.disappear = findEventIndex(line.disappearEvents, time);
      cursor.rotate = findEventIndex(line.rotateEvents, time);
      cursor.move = findEventIndex(line.moveEvents, time);
    });
    this.lastTime = time;
  }

  private advanceCursor<T extends { 0: number }>(events: readonly T[], time: number, index: number): number {
    let next = Math.max(0, index);
    while (next + 1 < events.length && events[next + 1]![0] <= time) next += 1;
    return next;
  }

  private lineState(line: PgrLine, time: number, width: number, height: number, cursor: LineCursor | null = null): LineState {
    const speedIndex = cursor?.speed ?? findEventIndex(line.speedEvents, time);
    const disappearIndex = cursor?.disappear ?? findEventIndex(line.disappearEvents, time);
    const rotateIndex = cursor?.rotate ?? findEventIndex(line.rotateEvents, time);
    const moveIndex = cursor?.move ?? findEventIndex(line.moveEvents, time);
    const [moveX, moveY] = sampleMoveAt(line.moveEvents, time, moveIndex);
    const rotation = -sampleTweenAt(line.rotateEvents, time, rotateIndex) * Math.PI / 180;
    return {
      x: (moveX + 1) * width / 2,
      y: (1 - moveY) * height / 2,
      cos: Math.cos(rotation),
      sin: Math.sin(rotation),
      lineHeight: sampleHeightAt(line.speedEvents, time, speedIndex),
      width,
      height,
      lineAlpha: clamp(sampleTweenAt(line.disappearEvents, time, disappearIndex, 1), 0, 1),
    };
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
    context.fillStyle = '#07060c';
    context.fillRect(0, 0, width, height);
    drawCover(context, this.illustration, width, height);
    context.fillStyle = `rgba(4, 3, 8, ${clamp(this.settings.backgroundDim, 0, 1)})`;
    context.fillRect(0, 0, width, height);

    if (!this.chart) return;
    this.lastVisitedNotes = 0;
    this.lastDrawnNotes = 0;
    this.lastMaxFutureLead = 0;
    this.lastNotesOnHiddenLines = 0;
    if (!Number.isFinite(this.lastTime) || time < this.lastTime || time - this.lastTime > 0.35) this.resetTimeline(time);

    const states: LineState[] = [];
    for (let lineIndex = 0; lineIndex < this.chart.lines.length; lineIndex += 1) {
      const line = this.chart.lines[lineIndex]!;
      const cursor = this.cursors[lineIndex]!;
      cursor.speed = this.advanceCursor(line.speedEvents, time, cursor.speed);
      cursor.disappear = this.advanceCursor(line.disappearEvents, time, cursor.disappear);
      cursor.rotate = this.advanceCursor(line.rotateEvents, time, cursor.rotate);
      cursor.move = this.advanceCursor(line.moveEvents, time, cursor.move);
      const state = this.lineState(line, time, width, height, cursor);
      states.push(state);
      if (state.lineAlpha > 0.002) this.drawLine(context, state);
    }
    if (this.noteAssets) {
      for (const kind of ['hold', 'drag', 'tap', 'flick'] as NoteKindKey[]) {
        for (let lineIndex = 0; lineIndex < this.chart.lines.length; lineIndex += 1) {
          this.drawNotes(context, this.renderCaches[lineIndex]!, states[lineIndex]!, time, kind);
        }
      }
    }
    this.drawHitEffects(context, time, width, height);
    context.globalAlpha = 1;
    this.lastTime = time;
    this.lastRenderedTime = time;
    this.maxVisitedNotes = Math.max(this.maxVisitedNotes, this.lastVisitedNotes);
    this.maxFutureLead = Math.max(this.maxFutureLead, this.lastMaxFutureLead);
    this.maxNotesOnHiddenLines = Math.max(this.maxNotesOnHiddenLines, this.lastNotesOnHiddenLines);
  }

  private drawLine(context: CanvasRenderingContext2D, state: LineState): void {
    context.save();
    context.translate(state.x, state.y);
    context.rotate(Math.atan2(state.sin, state.cos));
    context.globalAlpha = state.lineAlpha;
    context.strokeStyle = JUDGE_LINE_COLORS[this.settings.lineColor] ?? JUDGE_LINE_COLORS.white!;
    context.lineWidth = Math.max(2, state.height * 0.0089);
    context.beginPath();
    context.moveTo(-state.width * 3, 0);
    context.lineTo(state.width * 3, 0);
    context.stroke();
    context.restore();
  }

  private visibleDistanceLimit(state: LineState, above: boolean): number {
    const direction = above ? -1 : 1;
    const axisX = -state.sin * direction;
    const axisY = state.cos * direction;
    let limit = 0;
    for (const [x, y] of [[0, 0], [state.width, 0], [0, state.height], [state.width, state.height]]) {
      limit = Math.max(limit, (x - state.x) * axisX + (y - state.y) * axisY);
    }
    return limit + state.width * 0.12;
  }

  private drawNotes(context: CanvasRenderingContext2D, cache: LineRenderCache, state: LineState, time: number, kind: NoteKindKey): void {
    if (kind === 'hold') {
      for (const note of cache.holds) {
        this.lastVisitedNotes += 1;
        if (time >= note.endTime) continue;
        if (this.drawNote(context, note, state, time, this.visibleDistanceLimit(state, note.above))) this.recordDraw(note, state, time);
      }
      return;
    }

    for (const group of cache.groups) {
      if (!group.notes.some((note) => note.kind === kind)) continue;
      const limit = this.visibleDistanceLimit(state, group.above);
      let first = 0;
      let end = group.notes.length;
      if (group.speed > 0) {
        first = lowerBoundBy(group.notes, state.lineHeight, (note) => note.height);
        end = upperBoundBy(group.notes, state.lineHeight + limit / (state.height / 2 * group.speed), (note) => note.height);
      } else if (group.speed < 0) {
        first = lowerBoundBy(group.notes, state.lineHeight + limit / (state.height / 2 * group.speed), (note) => note.height);
        end = upperBoundBy(group.notes, state.lineHeight, (note) => note.height);
      }
      for (let index = first; index < end; index += 1) {
        const note = group.notes[index]!;
        if (note.kind !== kind) continue;
        this.lastVisitedNotes += 1;
        if (time >= note.time) continue;
        if (this.drawNote(context, note, state, time, limit)) this.recordDraw(note, state, time);
      }
    }
  }

  private recordDraw(note: PgrNote, state: LineState, time: number): void {
    this.lastDrawnNotes += 1;
    this.lastMaxFutureLead = Math.max(this.lastMaxFutureLead, note.time - time);
    if (state.lineAlpha <= 0.002) this.lastNotesOnHiddenLines += 1;
  }

  private drawNote(context: CanvasRenderingContext2D, note: PgrNote, state: LineState, time: number, visibleLimit: number): boolean {
    const direction = note.above ? -1 : 1;
    const halfHeight = state.height / 2;
    const along = note.positionX * state.width * 0.05625;
    const isMulti = this.settings.multiHint && note.multipleHint;
    const style = isMulti ? this.noteAssets!.multi : this.noteAssets!.normal;
    const multipleScale = isMulti ? style[note.kind].naturalWidth / this.noteAssets!.normal[note.kind].naturalWidth : 1;
    const noteWidth = scaledNoteWidth(state.width, this.settings.noteScale, multipleScale);
    const distance = (note.height - state.lineHeight) * note.speed * halfHeight;
    if (note.kind !== 'hold' && (distance < -0.5 || distance > visibleLimit)) return false;
    context.save();
    context.translate(state.x, state.y);
    context.rotate(Math.atan2(state.sin, state.cos));
    context.translate(along, 0);
    context.scale(1, direction);
    context.globalAlpha = 1;
    if (note.kind === 'hold') {
      const bottom = time >= note.time ? 0 : (note.height - state.lineHeight) * halfHeight;
      const top = (note.endHeight - state.lineHeight) * halfHeight;
      if (top < -0.5 || bottom > visibleLimit || top <= bottom) {
        context.restore();
        return false;
      }
      this.drawHold(
        context,
        style.hold,
        isMulti ? HOLD_ATLAS.multi : HOLD_ATLAS.normal,
        noteWidth,
        bottom,
        top,
        time < note.time,
      );
    } else {
      const image = style[note.kind];
      const noteHeight = noteWidth * image.naturalHeight / image.naturalWidth;
      drawTextureFlippedY(context, image, null, [-noteWidth / 2, distance - noteHeight / 2, noteWidth, noteHeight]);
    }
    context.restore();
    return true;
  }

  private drawHold(
    context: CanvasRenderingContext2D,
    image: HTMLImageElement,
    [tailAtlas, headAtlas]: readonly [number, number],
    width: number,
    bottom: number,
    top: number,
    showHead: boolean,
  ): void {
    const pixelScale = width / image.naturalWidth;
    const headHeight = headAtlas * pixelScale;
    const tailHeight = tailAtlas * pixelScale;
    const bodySourceHeight = image.naturalHeight - tailAtlas - headAtlas;
    const bodyHeight = top - bottom;

    drawTextureFlippedY(
      context,
      image,
      [0, tailAtlas, image.naturalWidth, bodySourceHeight],
      [-width / 2, bottom - 0.25, width, bodyHeight + 0.5],
    );
    if (showHead) {
      drawTextureFlippedY(
        context,
        image,
        [0, image.naturalHeight - headAtlas, image.naturalWidth, headAtlas],
        [-width / 2, bottom - headHeight, width, headHeight + 0.25],
      );
    }
    drawTextureFlippedY(
      context,
      image,
      [0, 0, image.naturalWidth, tailAtlas],
      [-width / 2, top - 0.25, width, tailHeight + 0.25],
    );
  }

  private drawHitEffects(context: CanvasRenderingContext2D, time: number, width: number, height: number): void {
    this.lastRenderedEffects = 0;
    if (!this.hitFxTexture || !this.hitEvents.length) return;
    const first = lowerBoundBy(this.hitEvents, time - HIT_FX_DURATION, (effect) => effect.time);
    const end = upperBoundBy(this.hitEvents, time, (effect) => effect.time);
    const frameWidth = this.hitFxTexture.width / HIT_FX_COLUMNS;
    const frameHeight = this.hitFxTexture.height / HIT_FX_ROWS;
    const size = scaledHitEffectDiameter(width, this.settings.noteScale);
    this.lastHitEffectDiameter = size;
    for (let index = first; index < end; index += 1) {
      const effect = this.hitEvents[index]!;
      const age = time - effect.time;
      if (age < 0 || age >= HIT_FX_DURATION) continue;
      const progress = age / HIT_FX_DURATION;
      const frame = Math.min(HIT_FX_COLUMNS * HIT_FX_ROWS - 1, Math.floor(progress * HIT_FX_COLUMNS * HIT_FX_ROWS));
      const state = this.lineState(this.chart!.lines[effect.lineIndex]!, effect.time, width, height);
      const along = effect.note.positionX * width * 0.05625;
      const x = state.x + state.cos * along;
      const y = state.y + state.sin * along;
      const alpha = progress < 0.5 ? 1 - progress * 0.6 : 1.4 * (1 - progress);
      context.save();
      context.globalAlpha = clamp(alpha, 0, 1);
      context.drawImage(
        this.hitFxTexture,
        frame % HIT_FX_COLUMNS * frameWidth,
        Math.floor(frame / HIT_FX_COLUMNS) * frameHeight,
        frameWidth,
        frameHeight,
        x - size / 2,
        y - size / 2,
        size,
        size,
      );
      const particleSize = width * HIT_FX_SCALE * clamp(this.settings.noteScale, 0.5, 2) / 44;
      for (let particle = 0; particle < 4; particle += 1) {
        const angle = particleAngle(effect.seed, particle);
        const distance = width * clamp(this.settings.noteScale, 0.5, 2) * (1.25 * age - 1.5 * age * age);
        const px = x + Math.cos(angle) * distance;
        const py = y + Math.sin(angle) * distance;
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
}
