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
import type { BeatmapData, ReplayData, SkinAssets, HitResult } from '../types/index';
import type { ModDifficulty } from '../utils/modDifficulty';
import type { AccFrame, ComboFrame } from '../renderer/HUDRenderer';
import type { ScoreFrame } from '../utils/scoreProcessor';
import type { URTimeline } from '../renderer/URBarRenderer';
import type { RenderOptions } from '../renderer/Renderer';

export interface Ruleset<Session> {
  /** 所有时间用谱面 ms；qualityTotal 是实际像素与逻辑像素的比例。 */
  build(
    beatmap: BeatmapData,
    replay: ReplayData,
    modDiff: ModDifficulty,
    skin: SkinAssets,
    qualityTotal: number,
  ): Session;

  draw(
    ctx: CanvasRenderingContext2D,
    session: Session,
    timeMs: number,
    options: RenderOptions,
  ): void;

  hitResults(session: Session): readonly HitResult[];

  scoreFrames(session: Session): readonly ScoreFrame[];

  accFrames(session: Session): readonly AccFrame[];

  comboFrames(session: Session): readonly ComboFrame[];

  urTimeline(session: Session): URTimeline;
}
