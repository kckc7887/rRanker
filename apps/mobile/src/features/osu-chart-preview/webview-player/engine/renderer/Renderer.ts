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
import type { ComboFrame } from './HUDRenderer';
import type { Ruleset } from '../rulesets/Ruleset';
import { stdRuleset } from '../rulesets/std/index';
import { taikoRuleset } from '../rulesets/taiko/index';
import { maniaRuleset } from '../rulesets/mania/index';
import { catchRuleset } from '../rulesets/catch/index';

export interface RenderOptions {
  showFollowpoints: boolean;
  hudOverlay?: (ctx: CanvasRenderingContext2D, timeMs: number) => void;
  backdropOverlay?: (ctx: CanvasRenderingContext2D, timeMs: number) => void;
  /** 仅调整视觉 ms，不移动音频与打击音时间。 */
  audioOffsetMs: number;
  /** mania 可视时间范围=11485/scrollSpeed ms。 */
  maniaScrollSpeed: number;
  maniaUpscroll: boolean;
  /** 视觉 Mod 仅影响绘制，不改变判定或音频。 */
  modHidden: boolean;
  modFlashlight: boolean;
  modFadeIn: boolean;
  modCover: boolean;
}

const LOGICAL_W = 1280;
const LOGICAL_H = 720;
/** 超采样开销约按倍率平方增长，实时绘制限制倍率。 */
const MAX_QUALITY = 3;

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly ruleset: Ruleset<any>;
  private readonly session: unknown;
  readonly hitResults: readonly HitResult[];
  /** combo-break 音效仅在断开前 combo>20 时播放。 */
  readonly comboFrames: readonly ComboFrame[];
  /** pre-v5 .osu 视觉比音频晚 24ms。 */
  readonly oldOffsetMs: number;
  readonly options: RenderOptions = {
    showFollowpoints: true,
    audioOffsetMs: 0,
    maniaScrollSpeed: 20,
    maniaUpscroll: false,
    modHidden: false,
    modFlashlight: false,
    modFadeIn: false,
    modCover: false,
  };

  constructor(
    canvas: HTMLCanvasElement,
    private readonly replay: ReplayData,
    beatmap: BeatmapData,
    skin: SkinAssets,
    modDiff: ModDifficulty,
  ) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (ctx === null) throw new Error('Failed to get 2D canvas context');
    this.ctx = ctx;
    this.options.modHidden = modDiff.isHD;
    this.options.modFlashlight = modDiff.isFL;
    this.options.modFadeIn = modDiff.isFadeIn;
    this.options.modCover = modDiff.isCover;
    const dpr = (typeof devicePixelRatio === 'number' ? devicePixelRatio : 1) || 1;
    const total = Math.max(1, Math.min(dpr, MAX_QUALITY));
    canvas.width = LOGICAL_W * total;
    canvas.height = LOGICAL_H * total;
    ctx.scale(total, total);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    /** 按回放模式选择规则，允许 standard 谱面转为其它模式。 */
    const ruleset: Ruleset<any> =
        replay.mode === 3 ? maniaRuleset
      : replay.mode === 1 ? taikoRuleset
      : replay.mode === 2 ? catchRuleset
      : stdRuleset;
    this.ruleset = ruleset;
    this.session = ruleset.build(beatmap, replay, modDiff, skin, total);
    this.hitResults = ruleset.hitResults(this.session);
    this.comboFrames = ruleset.comboFrames(this.session);
    if (replay.mode === 3) this.options.maniaUpscroll = (this.session as ManiaSession).defaultUpscroll;
    this.oldOffsetMs = beatmap.formatVersion < 5 ? 24 : 0;
  }

  /** mania 长押不在 hitObjects，按 sourceIndex 查音色。 */
  get maniaSamples(): ReadonlyMap<number, HitSample> | null {
    return this.replay.mode === 3 ? (this.session as ManiaSession).samplesBySource : null;
  }

  /** taiko 空击仍播放 don/kat 音效。 */
  get taikoGhostTaps(): readonly TaikoInputEvent[] | null {
    return this.replay.mode === 1 ? (this.session as TaikoSession).ghostTaps : null;
  }

  renderFrameAt(timeMs: number): void {
    const { ctx, options } = this;
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
    options.backdropOverlay?.(ctx, timeMs);
    this.ruleset.draw(ctx, this.session, timeMs, options);
    options.hudOverlay?.(ctx, timeMs);
  }
}
