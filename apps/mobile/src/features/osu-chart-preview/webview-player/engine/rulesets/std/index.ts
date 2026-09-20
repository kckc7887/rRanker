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

import { drawHitObjects } from '../../renderer/HitObjectRenderer';
import { drawFollowpoints } from '../../renderer/FollowpointRenderer';
import { drawCursor } from '../../renderer/CursorRenderer';
import { drawJudgements } from '../../renderer/JudgementRenderer';
import { drawKeyOverlay } from '../../renderer/KeyOverlayRenderer';
import { computeAccTimeline, computeComboTimeline } from '../../renderer/HUDRenderer';
import { computeHitResults, type SpinnerAngleData } from '../../utils/hitJudge';
import { computeScoreTimeline } from '../../utils/scoreProcessor';
import { computeURTimeline } from '../../renderer/URBarRenderer';
import { Flashlight } from '../../renderer/FlashlightRenderer';

/**
 * Immutable per-replay state for osu!standard, produced once by
 * `stdRuleset.build`. Everything derivable from the beatmap + replay is
 * precomputed here (judgements, spinner rotation, slider tracking, HUD
 * timelines); `draw` only reads.
 */
export interface StdSession {
  readonly beatmap: BeatmapData;
  readonly replay: ReplayData;
  readonly modDiff: ModDifficulty;
  readonly skin: SkinAssets;
  readonly hitResults: HitResult[];
  readonly spinnerAngles: Map<number, SpinnerAngleData>;
  readonly trackingIntervals: { start: number; end: number }[];
  readonly flashlight: Flashlight | null;
  readonly accFrames: AccFrame[];
  readonly comboFrames: ComboFrame[];
  readonly scoreFrames: ScoreFrame[];
  readonly urTimeline: URTimeline;
  readonly qualityTotal: number;
}

// HD toggled away from the score's actual mods: drawHitObjects/drawFollowpoints read
// modDiff.isHD, so hand them a flipped shallow copy (cached — the flags never change).
const _hdFlipCache = new WeakMap<StdSession, ModDifficulty>();
function effectiveModDiff(s: StdSession, modHidden: boolean): ModDifficulty {
  if (modHidden === s.modDiff.isHD) return s.modDiff;
  let md = _hdFlipCache.get(s);
  if (md === undefined) {
    md = { ...s.modDiff, isHD: !s.modDiff.isHD };
    _hdFlipCache.set(s, md);
  }
  return md;
}

// FL toggled on for a non-FL replay: built lazily on first draw (FL replays get theirs
// at session build, so the precompute cost stays off the toggle for them).
const _flCache = new WeakMap<StdSession, Flashlight>();
function stdFlashlight(s: StdSession): Flashlight {
  if (s.flashlight !== null) return s.flashlight;
  let fl = _flCache.get(s);
  if (fl === undefined) {
    fl = new Flashlight(s.beatmap, s.replay, s.modDiff, s.hitResults, s.trackingIntervals, s.qualityTotal);
    _flCache.set(s, fl);
  }
  return fl;
}

/**
 * osu!standard implementation of the {@link Ruleset} interface. `build` runs
 * hit judgement over the replay's cursor/key frames and precomputes all HUD
 * timelines; `draw` layers followpoints, hit objects, judgements, flashlight,
 * cursor and key overlay per the render options.
 */
export const stdRuleset: Ruleset<StdSession> = {
  build(
    beatmap: BeatmapData,
    replay: ReplayData,
    modDiff: ModDifficulty,
    skin: SkinAssets,
    qualityTotal: number,
  ): StdSession {
    const { results, spinnerAngles, trackingIntervals } = computeHitResults(beatmap, replay, modDiff);
    const accFrames   = computeAccTimeline(results);
    const comboFrames = computeComboTimeline(results);
    const scoreFrames = computeScoreTimeline(results, beatmap, modDiff);
    const urTimeline  = computeURTimeline(results, beatmap, modDiff);
    const flashlight  = modDiff.isFL
      ? new Flashlight(beatmap, replay, modDiff, results, trackingIntervals, qualityTotal)
      : null;
    return {
      beatmap, replay, modDiff, skin,
      hitResults: results,
      spinnerAngles,
      trackingIntervals,
      flashlight,
      accFrames,
      comboFrames,
      scoreFrames,
      urTimeline,
      qualityTotal,
    };
  },

  draw(
    ctx: CanvasRenderingContext2D,
    s: StdSession,
    timeMs: number,
    options: RenderOptions,
  ): void {
    const md = effectiveModDiff(s, options.modHidden);
    if (options.showFollowpoints) drawFollowpoints(ctx, s.beatmap, s.skin, timeMs, md);
    drawHitObjects(ctx, s.beatmap, s.skin, timeMs, s.hitResults, s.spinnerAngles, md, s.qualityTotal);
    drawJudgements(ctx, s.hitResults, timeMs, s.skin, 'std', md.circleRadiusPx);
    if (options.modFlashlight) stdFlashlight(s).draw(ctx, timeMs);
    drawCursor(ctx, s.replay, timeMs, s.skin);
    if (options.showKeyOverlay) drawKeyOverlay(ctx, s.replay, timeMs, s.skin);
  },

  hitResults:  (s) => s.hitResults,
  scoreFrames: (s) => s.scoreFrames,
  accFrames:   (s) => s.accFrames,
  comboFrames: (s) => s.comboFrames,
  urTimeline:  (s) => s.urTimeline,
};
