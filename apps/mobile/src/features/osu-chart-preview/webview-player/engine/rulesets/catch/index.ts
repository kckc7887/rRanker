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
import type { BeatmapData, ReplayData, SkinAssets, HitResult } from '../../types/index';
import type { ModDifficulty } from '../../utils/modDifficulty';
import type { AccFrame, ComboFrame } from '../../renderer/HUDRenderer';
import type { ScoreFrame } from '../../utils/scoreProcessor';
import type { URTimeline } from '../../renderer/URBarRenderer';
import type { RenderOptions } from '../../renderer/Renderer';
import type { Ruleset } from '../Ruleset';
import type { CatchSession } from './types';
import { convertBeatmapToCatch } from './converter';
import { applyPositionOffsets } from './positions';
import { catchFrames } from './input';
import { computeCatchHitResults } from './hitJudge';
import { drawCatchPlayfield } from './Playfield';
import { drawCatchKeyOverlay } from '../../renderer/KeyOverlayRenderer';
import { computeCatchAccTimeline, computeCatchScoreTimeline } from './scoreProcessor';
import { computeComboTimeline } from '../../renderer/HUDRenderer';

export type { CatchSession } from './types';

export const catchRuleset: Ruleset<CatchSession> = {
  build(
    beatmap: BeatmapData,
    replay: ReplayData,
    modDiff: ModDifficulty,
    skin: SkinAssets,
    _qualityTotal: number,
  ): CatchSession {

    console.assert(
      beatmap.mode === 2 || beatmap.mode === 0,
      `catchRuleset received unsupported beatmap.mode=${beatmap.mode}`,
    );

    const objects = convertBeatmapToCatch(beatmap, modDiff);

    applyPositionOffsets(objects, beatmap, modDiff);

    const catcherPath = catchFrames(replay);

    const hitResults = computeCatchHitResults(objects, catcherPath, modDiff.cs);

    const accFrames   = computeCatchAccTimeline(hitResults);
    const comboFrames = computeComboTimeline(hitResults);
    const scoreFrames = computeCatchScoreTimeline(objects, hitResults, beatmap, replay, modDiff);

    return {
      beatmap, replay, modDiff, skin,
      objects,
      catcherPath,
      hitResults,
      accFrames,
      comboFrames,
      scoreFrames,
      urTimeline:  { hits: [], zones: [] },
    };
  },

  draw(ctx: CanvasRenderingContext2D, s: CatchSession, timeMs: number, options: RenderOptions): void {

    drawCatchPlayfield(ctx, s, timeMs, options);

    if (options.showKeyOverlay) drawCatchKeyOverlay(ctx, s.catcherPath, timeMs, s.skin);
  },

  hitResults:  (s: CatchSession): readonly HitResult[] => s.hitResults,
  scoreFrames: (s: CatchSession): readonly ScoreFrame[] => s.scoreFrames,
  accFrames:   (s: CatchSession): readonly AccFrame[]   => s.accFrames,
  comboFrames: (s: CatchSession): readonly ComboFrame[] => s.comboFrames,
  urTimeline:  (s: CatchSession): URTimeline             => s.urTimeline,
};
