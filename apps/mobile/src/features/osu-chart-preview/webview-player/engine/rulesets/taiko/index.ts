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
import { computeTaikoURTimeline } from '../../renderer/URBarRenderer';
import type { RenderOptions } from '../../renderer/Renderer';
import type { Ruleset } from '../Ruleset';
import { convertBeatmapToTaiko } from './converter';
import { taikoFrames } from './input';
import {
  computeBarLineTimes, drawTaikoPlayfield, hasTaikoExplosion,
  scrollVelocityAt, taikoScrollMultiplier, LANE_WIDTH_PX,
} from './Playfield';
import { computeTaikoHitResults } from './hitJudge';
import { TaikoFlashlight } from './Flashlight';
import {
  computeTaikoScoreV1Timeline, computeTaikoScoreV2Timeline,
} from './scoreProcessor';
import { computeTaikoAccTimeline, computeComboTimeline } from '../../renderer/HUDRenderer';
import { drawJudgements } from '../../renderer/JudgementRenderer';
import type { TaikoSession, SwellProgress } from './types';

export type { TaikoSession, TaikoHitObject, TaikoHit, TaikoDrumRoll, TaikoSwell, SwellProgress } from './types';
export type { TaikoAction, TaikoInputEvent } from './input';

/**
 * osu!taiko implementation of the {@link Ruleset} interface. `build` converts the
 * beatmap through the TaikoBeatmapConverter port (native taiko or std converts),
 * judges the replay's key presses, and precomputes scroll velocities plus all HUD
 * timelines; `draw` renders the scrolling lane via `drawTaikoPlayfield`.
 */
export const taikoRuleset: Ruleset<TaikoSession> = {
  build(
    beatmap: BeatmapData,
    replay: ReplayData,
    modDiff: ModDifficulty,
    skin: SkinAssets,
    _qualityTotal: number,
  ): TaikoSession {
    // Only native taiko (mode 1) or convertible std (mode 0) maps are valid here;
    // callers must filter out mania/catch beatmaps before dispatching to this ruleset.
    console.assert(
      beatmap.mode === 1 || beatmap.mode === 0,
      `taikoRuleset received unsupported beatmap.mode=${beatmap.mode}`,
    );

    const objects = convertBeatmapToTaiko(beatmap);

    const inputEvents = replay.mode === 1 ? taikoFrames(replay) : [];

    const barLines = computeBarLineTimes(beatmap);

    // OverlappingScrollAlgorithm: per-object velocities locked at each item's own start time.
    // TODO: surface TaikoModConstantSpeed via modDiff.
    const isConstantSpeed = false;
    const smFactor = taikoScrollMultiplier(modDiff);
    const objectVel: number[] = new Array(objects.length);
    let minVel = Infinity;
    for (let i = 0; i < objects.length; i++) {
      const v = scrollVelocityAt(beatmap, objects[i]!.time, isConstantSpeed, smFactor);
      objectVel[i] = v;
      if (v > 0 && v < minVel) minVel = v;
    }
    const barLineVel: number[] = new Array(barLines.length);
    for (let i = 0; i < barLines.length; i++) {
      const v = scrollVelocityAt(beatmap, barLines[i]!, isConstantSpeed, smFactor);
      barLineVel[i] = v;
      if (v > 0 && v < minVel) minVel = v;
    }
    const maxScrollMs = isFinite(minVel) && minVel > 0
      ? LANE_WIDTH_PX / minVel
      : 5000;

    const session: TaikoSession = {
      beatmap, replay, modDiff, skin, objects, inputEvents, ghostTaps: [], barLines,
      objectVel, barLineVel, maxScrollMs,
      hitResults: [],
      accFrames: [],
      comboFrames: [],
      scoreFrames: [],
      swellProgress: new Map(),
      hitJudgmentByNote: new Map(),
      flashlight: null,
      urTimeline: { hits: [], zones: [] },
    };
    const { results: hitResults, ghostTaps } = computeTaikoHitResults(session, modDiff);

    const swellSrc = new Set<number>();
    for (const o of objects) if (o.kind === 'swell') swellSrc.add(o.sourceIndex);
    const swellProgress = new Map<number, { tickTimes: number[]; completionTime?: number }>();
    for (const r of hitResults) {
      if (!r.comboIgnore || !swellSrc.has(r.objectIndex)) continue;
      let entry = swellProgress.get(r.objectIndex);
      if (entry === undefined) {
        entry = { tickTimes: [] };
        swellProgress.set(r.objectIndex, entry);
      }
      if (r.strong) entry.completionTime = r.time;
      else          entry.tickTimes.push(r.time);
    }

    // hitJudge emits exactly one result per TaikoHit, carrying that note's unique noteId.
    // Keyed by noteId (NOT objectIndex/sourceIndex) so stream-converted slider notes — which
    // share a sourceIndex — each get their own judgement instead of collapsing onto the first.
    const hitJudgmentByNote = new Map<number, { time: number; judgement: number }>();
    for (const r of hitResults) {
      if (r.comboIgnore || r.noteId === undefined) continue;
      hitJudgmentByNote.set(r.noteId, { time: r.time, judgement: r.judgement });
    }

    const sessionWithResults = {
      ...session,
      hitResults,
      ghostTaps,
      swellProgress: swellProgress as ReadonlyMap<number, SwellProgress>,
      hitJudgmentByNote: hitJudgmentByNote as ReadonlyMap<number, { time: number; judgement: number }>,
    };
    const accFrames   = computeTaikoAccTimeline(hitResults);
    const comboFrames = computeComboTimeline(hitResults);
    const scoreFrames = modDiff.isLazer
      ? computeTaikoScoreV2Timeline(sessionWithResults, modDiff)
      : computeTaikoScoreV1Timeline(sessionWithResults, modDiff);

    const flashlight = modDiff.isFL ? new TaikoFlashlight(beatmap, comboFrames) : null;

    const urTimeline = computeTaikoURTimeline(objects, hitResults, modDiff);

    return { ...sessionWithResults, accFrames, comboFrames, scoreFrames, flashlight, urTimeline };
  },

  draw(
    ctx: CanvasRenderingContext2D,
    s: TaikoSession,
    timeMs: number,
    options: RenderOptions,
  ): void {
    drawTaikoPlayfield(ctx, s, timeMs, options);
    // Mode A (skin ships taiko-hit300) → playfield explosion only; Mode B → popup. Never both.
    if (options.showJudgement && !hasTaikoExplosion(s.skin)) {
      drawJudgements(ctx, s.hitResults, timeMs, s.skin, 'taiko');
    }
  },

  hitResults:  (s: TaikoSession): readonly HitResult[] => s.hitResults,
  scoreFrames: (s: TaikoSession): readonly ScoreFrame[] => s.scoreFrames,
  accFrames:   (s: TaikoSession): readonly AccFrame[] => s.accFrames,
  comboFrames: (s: TaikoSession): readonly ComboFrame[] => s.comboFrames,
  urTimeline:  (s: TaikoSession): URTimeline => s.urTimeline,
};
