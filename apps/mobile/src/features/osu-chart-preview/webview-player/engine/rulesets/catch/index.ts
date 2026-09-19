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
import { computeCatchHitResults, logCatchMissReport } from './hitJudge';
import { drawCatchPlayfield } from './Playfield';
import { drawCatchKeyOverlay } from '../../renderer/KeyOverlayRenderer';
import { computeCatchAccTimeline, computeCatchScoreTimeline, logCatchScoreCheck } from './scoreProcessor';
import { computeComboTimeline } from '../../renderer/HUDRenderer';

export type { CatchSession } from './types';

/**
 * The osu!catch ruleset implementation: builds a {@link CatchSession} from a parsed
 * beatmap + replay (conversion → position offsets → catcher path → judgement → timelines)
 * and renders the playfield each frame. All times are beatmap milliseconds.
 */
export const catchRuleset: Ruleset<CatchSession> = {
  build(
    beatmap: BeatmapData,
    replay: ReplayData,
    modDiff: ModDifficulty,
    skin: SkinAssets,
    _qualityTotal: number,
  ): CatchSession {
    // Native catch (mode 2) or std→catch convert (mode 0); anything else is a caller bug.
    console.assert(
      beatmap.mode === 2 || beatmap.mode === 0,
      `catchRuleset received unsupported beatmap.mode=${beatmap.mode}`,
    );

    // Convert beatmap objects → flat palpable list.
    const objects = convertBeatmapToCatch(beatmap, modDiff);
    // Byte-exact EffectiveX + hyperdash flags, in place.
    applyPositionOffsets(objects, beatmap, modDiff);

    // Decode the replay's catcher path.
    const catcherPath = catchFrames(replay);

    // Positional hit judgement: sample catcher path at each object's time, run 1-D overlap test → one HitResult per palpable object.
    const hitResults = computeCatchHitResults(objects, catcherPath, modDiff.cs);

    // Catch-specific score/acc/combo timelines: tiny droplets affect accuracy but not combo, bananas are bonus-only.
    const accFrames   = computeCatchAccTimeline(hitResults);
    const comboFrames = computeComboTimeline(hitResults);
    const scoreFrames = computeCatchScoreTimeline(objects, hitResults, beatmap, replay, modDiff);

    // Validation aid (browser console): our final score/combo/acc vs the .osr header, plus a
    // per-miss report to tell near-edge frame-quantization misses from genuine position/path bugs.
    logCatchScoreCheck(hitResults, scoreFrames, accFrames, replay, modDiff);
    logCatchMissReport(objects, catcherPath, modDiff.cs);

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
    // Falling fruit/droplets/bananas + replay-driven catcher.
    drawCatchPlayfield(ctx, s, timeMs, options);
    // Key overlay (Left/Right/Dash), drawn on top of the playfield.
    if (options.showKeyOverlay) drawCatchKeyOverlay(ctx, s.catcherPath, timeMs, s.skin);
  },

  hitResults:  (s: CatchSession): readonly HitResult[] => s.hitResults,
  scoreFrames: (s: CatchSession): readonly ScoreFrame[] => s.scoreFrames,
  accFrames:   (s: CatchSession): readonly AccFrame[]   => s.accFrames,
  comboFrames: (s: CatchSession): readonly ComboFrame[] => s.comboFrames,
  urTimeline:  (s: CatchSession): URTimeline             => s.urTimeline,
};
