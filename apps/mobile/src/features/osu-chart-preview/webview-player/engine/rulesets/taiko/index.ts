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
import type { ComboFrame } from '../../renderer/HUDRenderer';
import type { RenderOptions } from '../../renderer/Renderer';
import type { Ruleset } from '../Ruleset';
import { convertBeatmapToTaiko } from './converter';
import { taikoFrames } from './input';
import {
  computeBarLineTimes, drawTaikoPlayfield,
  scrollVelocityAt, taikoScrollMultiplier, LANE_WIDTH_PX,
} from './Playfield';
import { computeTaikoHitResults } from './hitJudge';
import { TaikoFlashlight } from './Flashlight';
import { computeComboTimeline } from '../../renderer/HUDRenderer';
import type { TaikoSession, SwellProgress } from './types';

export type { TaikoSession, TaikoHitObject, TaikoHit, TaikoDrumRoll, TaikoSwell, SwellProgress } from './types';
export type { TaikoAction, TaikoInputEvent } from './input';

export const taikoRuleset: Ruleset<TaikoSession> = {
  build(
    beatmap: BeatmapData,
    replay: ReplayData,
    modDiff: ModDifficulty,
    skin: SkinAssets,
    _qualityTotal: number,
  ): TaikoSession {


    const objects = convertBeatmapToTaiko(beatmap);

    const inputEvents = replay.mode === 1 ? taikoFrames(replay) : [];

    const barLines = computeBarLineTimes(beatmap);

    /** Constant Speed 仅对应 lazer 的 CS acronym，stable 没有该位。 */
    const isConstantSpeed = modDiff.isConstantSpeed;
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
      comboFrames: [],
      swellProgress: new Map(),
      hitJudgmentByNote: new Map(),
      flashlight: null,
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

    /** 滑条转换的多颗音符共享 sourceIndex，判定必须按唯一 noteId 映射。 */

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
    const comboFrames = computeComboTimeline(hitResults);

    const flashlight = modDiff.isFL ? new TaikoFlashlight(beatmap, comboFrames) : null;


    return { ...sessionWithResults, comboFrames, flashlight };
  },

  draw(
    ctx: CanvasRenderingContext2D,
    s: TaikoSession,
    timeMs: number,
    options: RenderOptions,
  ): void {
    drawTaikoPlayfield(ctx, s, timeMs, options);
  },

  hitResults:  (s: TaikoSession): readonly HitResult[] => s.hitResults,
  comboFrames: (s: TaikoSession): readonly ComboFrame[] => s.comboFrames,
};
