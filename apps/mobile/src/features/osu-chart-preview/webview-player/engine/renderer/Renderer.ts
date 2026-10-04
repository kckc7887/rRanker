/*
 * Source: https://github.com/daladal/replayviewer-js
 * Adapted for fixed-speed chart preview.
 *
 * MIT License
 *
 * Copyright (c) 2026 bog
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
import type { BeatmapData, ReplayData, HitResult, HitSample, SkinAssets } from '../types/index';
import type { ManiaSession } from '../rulesets/mania/index';
import type { TaikoSession } from '../rulesets/taiko/types';
import type { TaikoInputEvent } from '../rulesets/taiko/input';
import type { ModDifficulty } from '../utils/modDifficulty';
import { Player } from '../player/Player';
import { TimeMapper } from '../player/TimeMapper';
import { drawHUD, type AccFrame,
         drawCombo, type ComboFrame,
         drawModIcons, drawScore } from './HUDRenderer';
import type { ScoreFrame } from '../utils/scoreProcessor';
import { drawURBar, type URTimeline } from './URBarRenderer';
import type { Ruleset } from '../rulesets/Ruleset';
import { stdRuleset } from '../rulesets/std/index';
import { taikoRuleset } from '../rulesets/taiko/index';
import { maniaRuleset } from '../rulesets/mania/index';
import { catchRuleset } from '../rulesets/catch/index';

export interface RenderOptions {
  showJudgement:    boolean;
  showKeyOverlay:   boolean;
  showFollowpoints: boolean;
  showURBar:        boolean;
  showModIcons:     boolean;

  hudOverlay?: (ctx: CanvasRenderingContext2D, timeMs: number) => void;

  backdropOverlay?: (ctx: CanvasRenderingContext2D, timeMs: number) => void;

  backgroundDim:  number;
  /** 仅调整视觉 ms，不移动音频与打击音时间。 */
  audioOffsetMs: number;

  qualityScale: 'auto' | 1 | 1.5 | 2 | 3;
  /** mania 可视时间范围=11485/scrollSpeed ms。 */
  maniaScrollSpeed: number;

  maniaUpscroll: boolean;
  /** 视觉 Mod 仅影响绘制，不改变判定、计分或音频。 */

  modHidden:     boolean;
  modFlashlight: boolean;
  modFadeIn:     boolean;
  modCover:      boolean;
}

const LOGICAL_W = 1280;
const LOGICAL_H = 720;

export interface ExportRenderBundle {
  replay: ReplayData;
  beatmap: BeatmapData;
  skin: SkinAssets;
  background: ImageBitmap | null;
  modDiff: ModDifficulty;
  options: RenderOptions;
  presentationDurationMs: number;
  introOffsetMs: number;
  outroOffsetMs: number;
  speed: number;
}

/** 超采样开销约按倍率平方增长，实时绘制限制倍率。 */

const MAX_QUALITY = 3;

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;

  private readonly _ruleset: Ruleset<any>;
  private readonly _session: unknown;
  private readonly _hitResults: readonly HitResult[];
  private readonly _accFrames: readonly AccFrame[];
  private readonly _comboFrames: readonly ComboFrame[];
  private readonly _scoreFrames: readonly ScoreFrame[];
  private readonly _urTimeline: URTimeline;
  private _rafId: number | null = null;
  private _running = false;

  readonly options: RenderOptions = {
    showJudgement:    true,
    showKeyOverlay:   true,
    showFollowpoints: true,
    showURBar:        true,
    showModIcons:     true,
    backgroundDim:    0.80,
    audioOffsetMs:    0,
    qualityScale:     'auto',
    maniaScrollSpeed: 20,
    maniaUpscroll:    false,
    modHidden:        false,
    modFlashlight:    false,
    modFadeIn:        false,
    modCover:         false,
  };

  private readonly _qualityTotal: number;

  private readonly _bgDrawX: number = 0;
  private readonly _bgDrawY: number = 0;
  private readonly _bgDrawW: number = 0;
  private readonly _bgDrawH: number = 0;

  /** pre-v5 .osu 视觉比音频晚 24ms。 */
  private readonly _oldOffsetMs: number;

  private _backdrop: OffscreenCanvas | null = null;
  private _backdropDim = -1;

  constructor(
    private readonly canvas: HTMLCanvasElement | OffscreenCanvas,
    private readonly player: Player,
    private readonly replay: ReplayData,
    private readonly beatmap: BeatmapData,
    private readonly skin: SkinAssets,
    private readonly timeMapper: TimeMapper,
    private readonly _background: ImageBitmap | null = null,
    private readonly modDiff: ModDifficulty,

    qualityOverride?: number,

    pageZoom = 1,
  ) {

    const ctx = (canvas as HTMLCanvasElement).getContext('2d', { alpha: false }) as CanvasRenderingContext2D | null;
    if (ctx === null) throw new Error('Failed to get 2D canvas context');
    this.ctx = ctx;
    this.options.modHidden     = modDiff.isHD;
    this.options.modFlashlight = modDiff.isFL;
    this.options.modFadeIn     = modDiff.isFadeIn;
    this.options.modCover      = modDiff.isCover;

    const q = this.options.qualityScale;
    const dpr = (typeof devicePixelRatio === 'number' ? devicePixelRatio : 1) || 1;
    const total = qualityOverride !== undefined
      ? qualityOverride
      : q === 'auto'
        ? Math.max(1, Math.min(dpr * pageZoom, MAX_QUALITY))
        : q;
    if (qualityOverride !== undefined) {
      /** H.264 要求偶数宽高，backing store 向最近偶数像素取整。 */
      canvas.width  = 2 * Math.round((LOGICAL_W * total) / 2);
      canvas.height = 2 * Math.round((LOGICAL_H * total) / 2);
    } else {
      canvas.width  = LOGICAL_W * total;
      canvas.height = LOGICAL_H * total;
    }
    ctx.scale(total, total);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    this._qualityTotal = total;
    if (_background !== null) {
      const scale = Math.max(LOGICAL_W / _background.width, LOGICAL_H / _background.height);
      this._bgDrawW = _background.width * scale;
      this._bgDrawH = _background.height * scale;
      this._bgDrawX = (LOGICAL_W - this._bgDrawW) / 2;
      this._bgDrawY = (LOGICAL_H - this._bgDrawH) / 2;
    }
    /** 按回放模式选择规则，允许 standard 谱面转为其它模式。 */

    const ruleset: Ruleset<any> =
        replay.mode === 3 ? maniaRuleset
      : replay.mode === 1 ? taikoRuleset
      : replay.mode === 2 ? catchRuleset
      : stdRuleset;
    this._ruleset    = ruleset;
    this._session    = ruleset.build(beatmap, replay, modDiff, skin, this._qualityTotal);
    this._hitResults  = ruleset.hitResults(this._session);
    this._accFrames   = ruleset.accFrames(this._session);
    this._comboFrames = ruleset.comboFrames(this._session);
    this._scoreFrames = ruleset.scoreFrames(this._session);
    this._urTimeline  = ruleset.urTimeline(this._session);

    if (replay.mode === 3) {
      this.options.maniaUpscroll = (this._session as ManiaSession).defaultUpscroll;
    }
    this._oldOffsetMs = beatmap.formatVersion < 5 ? 24 : 0;
  }

  get hitResults(): readonly HitResult[] { return this._hitResults; }

  /** combo-break 音效仅在断开前 combo>20 时播放。 */
  get comboFrames(): readonly ComboFrame[] { return this._comboFrames; }

  /** mania 长押不在 hitObjects，按 sourceIndex 查音色。 */
  get maniaSamples(): ReadonlyMap<number, HitSample> | null {
    if (this.replay.mode !== 3) return null;
    return (this._session as ManiaSession).samplesBySource;
  }

  /** taiko 空击仍播放 don/kat 音效。 */
  get taikoGhostTaps(): readonly TaikoInputEvent[] | null {
    if (this.replay.mode !== 1) return null;
    return (this._session as TaikoSession).ghostTaps;
  }

  currentScore(): number {
    const timeMs =
      this.timeMapper.toMapTime(this.player.currentTimeMs) +
      this.options.audioOffsetMs * this.timeMapper.speed -
      this._oldOffsetMs;
    return this.scoreAt(timeMs);
  }

  scoreAt(mapTimeMs: number): number {
    const frames = this._scoreFrames;
    if (frames.length === 0 || mapTimeMs < frames[0]!.time) return 0;
    if (mapTimeMs >= frames[frames.length - 1]!.time) return frames[frames.length - 1]!.score;
    let lo = 0, hi = frames.length - 2;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (frames[mid]!.time <= mapTimeMs) lo = mid; else hi = mid - 1;
    }
    return frames[lo]!.score;
  }

  get oldOffsetMs(): number { return this._oldOffsetMs; }

  renderFrameAt(mapTimeMs: number): void {
    this._draw(mapTimeMs);
  }

  cloneForExport(canvas: OffscreenCanvas, quality: number): Renderer {
    const clone = new Renderer(
      canvas,
      new Player(this.timeMapper.presentationDurationMs),
      this.replay, this.beatmap, this.skin, this.timeMapper, this._background, this.modDiff,
      quality,
    );
    Object.assign(clone.options, this.options);
    return clone;
  }

  exportBundle(): ExportRenderBundle {
    return {
      replay: this.replay,
      beatmap: this.beatmap,
      skin: this.skin,
      background: this._background,
      modDiff: this.modDiff,
      options: this.options,
      presentationDurationMs: this.timeMapper.presentationDurationMs,
      introOffsetMs: this.timeMapper.introOffsetMs,
      outroOffsetMs: this.timeMapper.outroOffsetMs,
      speed: this.timeMapper.speed,
    };
  }

  static buildForExport(canvas: OffscreenCanvas, quality: number, b: ExportRenderBundle): Renderer {
    const timeMapper = new TimeMapper(b.replay.frames, b.introOffsetMs, b.outroOffsetMs, b.speed);
    const r = new Renderer(
      canvas,
      new Player(b.presentationDurationMs),
      b.replay, b.beatmap, b.skin, timeMapper, b.background, b.modDiff,
      quality,
    );
    Object.assign(r.options, b.options);
    return r;
  }

  start(): void {
    if (this._running) return;
    this._running = true;
    this._tick();
  }

  stop(): void {
    this._running = false;
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  private _tick = (): void => {
    if (!this._running) return;

    /** audioOffset 按 Mod 速度换成谱面 ms。 */
    const timeMs =
      this.timeMapper.toMapTime(this.player.currentTimeMs) +
      this.options.audioOffsetMs * this.timeMapper.speed -
      this._oldOffsetMs;
    this._draw(timeMs);

    this._rafId = requestAnimationFrame(this._tick);
  };

  private _ensureBackdrop(bg: ImageBitmap, dim: number): OffscreenCanvas {
    if (this._backdrop === null) {
      this._backdrop = new OffscreenCanvas(this.canvas.width, this.canvas.height);
    }
    if (dim !== this._backdropDim) {
      const octx = this._backdrop.getContext('2d');
      if (octx === null) throw new Error('Failed to get 2D backdrop context');
      octx.setTransform(this._qualityTotal, 0, 0, this._qualityTotal, 0, 0);
      octx.imageSmoothingEnabled = true;
      octx.imageSmoothingQuality = 'high';
      /** 先铺不透明底色，避免透明 PNG 留下透空区域。 */
      octx.fillStyle = '#1a1a2e';
      octx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
      octx.drawImage(bg, this._bgDrawX, this._bgDrawY, this._bgDrawW, this._bgDrawH);
      octx.fillStyle = `rgba(10, 10, 20, ${dim})`;
      octx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
      this._backdropDim = dim;
    }
    return this._backdrop;
  }

  private _draw(timeMs: number): void {
    const { ctx } = this;
    const { options } = this;

    if (options.backdropOverlay !== undefined) {
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
      options.backdropOverlay(ctx, timeMs);
    } else if (this._background !== null) {
      const dim = Math.max(0, Math.min(1, options.backgroundDim));
      const backdrop = this._ensureBackdrop(this._background, dim);

      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(backdrop, 0, 0);
      ctx.restore();
    } else {
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
    }

    this._ruleset.draw(ctx, this._session, timeMs, options);

    if (options.showJudgement) {
      drawScore(ctx, this._scoreFrames, timeMs, this.skin);
      drawHUD(ctx, this._accFrames, timeMs, this.skin);

      if (this.replay.mode !== 3 && this.replay.mode !== 2) drawCombo(ctx, this._comboFrames, timeMs, this.skin);
    }

    if (options.showModIcons) drawModIcons(ctx, this.modDiff.mods, this.skin);

    if (options.hudOverlay !== undefined) options.hudOverlay(ctx, timeMs);

    if (options.showURBar) drawURBar(ctx, this._urTimeline, timeMs);
  }
}
