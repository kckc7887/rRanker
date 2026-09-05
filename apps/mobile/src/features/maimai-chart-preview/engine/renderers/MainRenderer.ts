/** Canvas 2D backend for MajdataViewX-compatible frame commands (GPL-3.0).
 * World-space transforms, 3-slice UV and radial mask follow the reference shaders.
 * See THIRD_PARTY_NOTICES.md. */
import type { Chart, RendererConfig } from '../types';
import { TimingTimeline } from '../core/timing/TimingTimeline';
import { ChartPreviewSkin } from './skinAtlas';
import { buildFrame, prepareChart, completedAt, type DrawCommand, type PreparedChart } from './frame';
import { parseJudgeHint } from '../utils/judgeHint';
import { EffectRenderer } from './effects';
import { SKIN_TRANSFORM } from './skinSemantics';

export interface FrameOverlayInfo { bpm: number; beatText: string; fps: number; completedNotes: number; totalNotes: number; completedBreaks: number; totalBreaks: number; completedBreaksNoEx: number; totalBreaksNoEx: number }
export interface MainRendererConfig { skin?: ChartPreviewSkin }
export function mirrorHint(command: DrawCommand, mx: number, my: number): DrawCommand {
  const path = mx * my < 0 && command.path.startsWith('SlideOKSkins/') ? command.path.replace(/_(l|r)(?=_|\.)/, (_, side) => side === 'l' ? '_r' : '_l') : command.path;
  return { ...command, path, x: command.x * mx, y: command.y * my, angle: command.angle * mx * my + (my < 0 ? Math.PI : 0) };
}
export const DEFAULT_RENDERER_CONFIG: RendererConfig = {
    hiSpeed: 6, alwaysKeepHiSpeed: false, playbackSpeed: 1, mirrorMode: 'none', highlightExNotes: false,
    normalColorBreakSlide: false, pinkSlideStart: false, slideRotation: true, judgmentLineDesign: 'simple',
    showBpm: true, showNoteTotal: true, showBreakCount: true, showBreakIndex: false, rainbowBpm: false,
    ddrColorMode: false, ddrColorExtended: false, showFireworks: true, showHitEffect: true, judgeHint: 'distinguish',
  };

export class MainRenderer {
  private ctx: CanvasRenderingContext2D;
  private maxPixels = 2_500_000;
  private skin: ChartPreviewSkin;
  private effects: EffectRenderer;
  private timeMs = 0;
  private prepared?: PreparedChart;
  private timeline?: TimingTimeline;
  private video: HTMLVideoElement | null = null;
  private background: HTMLImageElement | null = null;
  private backgroundCache: HTMLCanvasElement | null = null;
  private tinted = new Map<string, HTMLCanvasElement>();
  private fps = 0;
  frameOverlay: FrameOverlayInfo | null = null;
  readonly config: RendererConfig = { ...DEFAULT_RENDERER_CONFIG };
  constructor(private canvas: HTMLCanvasElement, options: MainRendererConfig = {}) {
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Canvas unavailable');
    this.ctx = context; this.skin = options.skin ?? new ChartPreviewSkin(); this.resize();
    this.effects = new EffectRenderer(this.skin);
  }
  async loadSkin() { await this.skin.load(); }
  resize(fullscreen = false) {
    const rect = this.canvas.parentElement?.getBoundingClientRect();
    const size = rect ? Math.min(rect.width, rect.height || rect.width) : this.canvas.clientWidth || 540;
    this.applySize(size, fullscreen);
  }
  resizeToSize(size: number) { this.applySize(size, true); }
  private applySize(size: number, fullscreen: boolean) {
    const logical = Math.max(1, size), dpr = Math.min(2, globalThis.devicePixelRatio || 1, fullscreen ? Math.sqrt(this.maxPixels) / logical : 2);
    this.canvas.width = Math.round(logical * dpr); this.canvas.height = this.canvas.width;
    this.canvas.style.width = `${logical}px`; this.canvas.style.height = `${logical}px`;
    this.backgroundCache = null;
  }
  prepare(chart: Chart) { if (this.prepared?.chart === chart) return; this.prepared = prepareChart(chart); this.timeline = TimingTimeline.fromChart(chart); this.effects.prepare(); }
  renderAtTime(chart: Chart, now: number) {
    this.timeMs = now;
    this.prepare(chart); this.clear(); this.renderJudgmentLine();
    const ctx = this.ctx, unit = this.canvas.width / 10.8;
    ctx.save(); ctx.translate(this.canvas.width / 2, this.canvas.height / 2); ctx.scale(unit, unit);
    const mx = this.config.mirrorMode === 'horizontal' || this.config.mirrorMode === 'rotate180' ? -1 : 1;
    const my = this.config.mirrorMode === 'vertical' || this.config.mirrorMode === 'rotate180' ? -1 : 1;
    for (const command of buildFrame(this.prepared!, now, this.config)) {
      ctx.save();
      if (command.path.startsWith('JudgeTextSkins/') || command.path.startsWith('SlideOKSkins/')) this.draw(mirrorHint(command, mx, my));
      else { ctx.scale(mx, my); this.draw(command); }
      ctx.restore();
    }
    ctx.restore();
    const { notes, breaks, noEx } = this.prepared!.judgements;
    const count = (items: readonly number[]) => completedAt(items, now);
    const beat = this.timeline!.beatFromMs(now);
    let signature: Chart['signatures'][number] | undefined;
    for (const entry of chart.signatures) { if (entry.timeMs > now) break; signature = entry; }
    const numerator = signature?.numerator ?? 4, denominator = signature?.denominator ?? 4;
    const signatureBeat = signature ? this.timeline!.beatFromMs(signature.timeMs) : 4;
    const localBeat = Math.max(0, (beat - signatureBeat) * denominator / 4);
    const beatText = `${Math.floor(localBeat / numerator) + 1}:${Math.floor(localBeat % numerator) + 1}/${numerator}`;
    this.frameOverlay = { bpm: this.timeline!.bpmAtBeat(beat), beatText, fps: this.fps, completedNotes: count(notes), totalNotes: notes.length, completedBreaks: count(breaks), totalBreaks: breaks.length, completedBreaksNoEx: count(noEx), totalBreaksNoEx: noEx.length };
  }
  private draw(command: DrawCommand) {
    if (command.effect) {
      const ctx = this.ctx; ctx.save(); ctx.translate(command.x, -command.y); ctx.rotate(-command.angle);
      this.effects.draw(ctx, command.effect.kind, command.effect.ageMs, command.effect.isBreak, this.timeMs, command.effect.color); ctx.restore(); return;
    }
    const image = this.skin.get(command.path);
    if (!image) throw new Error(`Required sprite missing: ${command.path}`);
    const ctx = this.ctx, nativeWidth = image.naturalWidth / SKIN_TRANSFORM.pixelsPerUnit, nativeHeight = image.naturalHeight / SKIN_TRANSFORM.pixelsPerUnit;
    const width = nativeWidth * command.scale, height = (nativeHeight + (command.stretch ?? 0)) * command.scale;
    ctx.save(); ctx.translate(command.x, -command.y); ctx.rotate(-command.angle); ctx.globalAlpha = command.alpha;
    if (command.brightness && command.brightness !== 1) ctx.filter = `brightness(${command.brightness})`;
    if (command.cutoff !== undefined) {
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, Math.hypot(width, height), -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * command.cutoff); ctx.closePath(); ctx.clip();
    }
    const baseImage = command.recolor ? this.tint(command.path, command.recolor) ?? image : image;
    this.drawSliced(baseImage, image.naturalWidth, image.naturalHeight, width, height, command.stretch !== undefined, command.scale);
    if (command.exPath) {
      const overlay = this.tint(command.exPath, command.tint ?? '#ffffff');
      if (overlay) this.drawSliced(overlay, overlay.width, overlay.height, width, height, command.stretch !== undefined, command.scale);
    }
    ctx.restore();
  }
  private drawSliced(image: CanvasImageSource, sourceW: number, sourceH: number, width: number, height: number, sliced: boolean, scale: number) {
    const ctx = this.ctx;
    if (!sliced) { ctx.drawImage(image, -width / 2, -height / 2, width, height); return; }
    const sourceCap = sourceH * SKIN_TRANSFORM.holdSlice[0], cap = sourceCap / SKIN_TRANSFORM.pixelsPerUnit * scale;
    const body = Math.max(0, height - cap * 2);
    ctx.drawImage(image, 0, 0, sourceW, sourceCap, -width / 2, -height / 2, width, cap);
    if (body > 0) ctx.drawImage(image, 0, sourceCap, sourceW, sourceH - sourceCap * 2, -width / 2, -height / 2 + cap, width, body);
    ctx.drawImage(image, 0, sourceH - sourceCap, sourceW, sourceCap, -width / 2, height / 2 - cap, width, cap);
  }
  private tint(path: string, color: string) {
    const key = `${path}:${color}`, cached = this.tinted.get(key); if (cached) return cached;
    const image = this.skin.get(path); if (!image) return null;
    const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0); ctx.globalCompositeOperation = 'source-in'; ctx.fillStyle = color; ctx.fillRect(0, 0, canvas.width, canvas.height);
    this.tinted.set(key, canvas); return canvas;
  }
  clear() {
    const ctx = this.ctx, size = this.canvas.width;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.fillStyle = '#080a10'; ctx.fillRect(0, 0, size, size);
    if (this.video && this.video.readyState >= 2 && this.video.videoWidth > 0) this.drawBackgroundSource(this.video, this.video.videoWidth, this.video.videoHeight);
    else if (this.background?.complete && this.background.naturalWidth > 0) {
      if (!this.backgroundCache) {
        const cache = document.createElement('canvas'); cache.width = size; cache.height = size;
        const c = cache.getContext('2d')!, image = this.background;
        const scale = Math.max(size / image.naturalWidth, size / image.naturalHeight);
        c.drawImage(image, (size - image.naturalWidth * scale) / 2, (size - image.naturalHeight * scale) / 2, image.naturalWidth * scale, image.naturalHeight * scale);
        this.backgroundCache = cache;
      }
      ctx.drawImage(this.backgroundCache, 0, 0);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, 0, size, size);
  }
  private drawBackgroundSource(source: CanvasImageSource, width: number, height: number) {
    const size = this.canvas.width, scale = Math.max(size / width, size / height);
    this.ctx.drawImage(source, (size - width * scale) / 2, (size - height * scale) / 2, width * scale, height * scale);
  }
  renderJudgmentLine() {
    if (this.config.judgmentLineDesign === 'blind') return;
    const ctx = this.ctx, size = this.canvas.width, unit = size / 10.8, radius = unit * 4.8, c = size / 2;
    ctx.save(); ctx.strokeStyle = '#ffffff'; ctx.fillStyle = '#ffffff'; ctx.lineWidth = unit * 0.012;
    if (this.config.judgmentLineDesign !== 'noLine') { ctx.beginPath(); ctx.arc(c, c, radius, 0, Math.PI * 2); ctx.stroke(); }
    for (let i = 0; i < 8; i++) {
      const angle = (-67.5 + i * 45) * Math.PI / 180;
      ctx.beginPath(); ctx.arc(c + Math.cos(angle) * radius, c + Math.sin(angle) * radius, unit * 0.04, 0, Math.PI * 2); ctx.fill();
      if (this.config.judgmentLineDesign === 'sensor') { ctx.save(); ctx.globalAlpha = 0.15; ctx.beginPath(); ctx.moveTo(c + Math.cos(angle + Math.PI / 8) * unit * 1.15, c + Math.sin(angle + Math.PI / 8) * unit * 1.15); ctx.lineTo(c + Math.cos(angle + Math.PI / 8) * radius, c + Math.sin(angle + Math.PI / 8) * radius); ctx.stroke(); ctx.restore(); }
    }
    ctx.restore();
  }
  setHiSpeed(value: number) { this.config.hiSpeed = value; }
  setAlwaysKeepHiSpeed(value: boolean) { this.config.alwaysKeepHiSpeed = value; }
  setPlaybackSpeed(value: number) { this.config.playbackSpeed = value; }
  setFps(value: number) { this.fps = value; }
  setHighlightExNotes(value: boolean) { this.config.highlightExNotes = value; }
  setNormalColorBreakSlide(value: boolean) { this.config.normalColorBreakSlide = value; }
  setPinkSlideStart(value: boolean) { this.config.pinkSlideStart = value; }
  setSlideRotation(value: boolean) { this.config.slideRotation = value; }
  setMirrorMode(value: string) { this.config.mirrorMode = ['horizontal', 'vertical', 'rotate180'].includes(value) ? value as RendererConfig['mirrorMode'] : 'none'; }
  setJudgmentLineDesign(value: string) { this.config.judgmentLineDesign = ['blind', 'noLine', 'sensor'].includes(value) ? value as RendererConfig['judgmentLineDesign'] : 'simple'; }
  setShowFireworks(value: boolean) { this.config.showFireworks = value; }
  setShowHitEffect(value: boolean) { this.config.showHitEffect = value; }
  setJudgeHint(value: string) { this.config.judgeHint = parseJudgeHint(value); }
  setShowBpm(value: boolean) { this.config.showBpm = value; }
  setShowNoteTotal(value: boolean) { this.config.showNoteTotal = value; }
  setShowBreakCount(value: boolean) { this.config.showBreakCount = value; }
  setFullscreenMaxPixels(value: number) { this.maxPixels = value; }
  setBackgroundVideo(value: HTMLVideoElement | null) { this.video = value; }
  setBackgroundImage(value: HTMLImageElement | null) { if (this.background !== value) this.backgroundCache = null; this.background = value; }
}
