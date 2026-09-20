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
import type { CatcherFrame } from './input';

/** The four palpable catch object kinds (lazer's Fruit, Droplet, TinyDroplet, Banana). */
export type CatchObjectType = 'fruit' | 'droplet' | 'tinyDroplet' | 'banana';

/**
 * A palpable catch object — the only things the catcher can catch. JuiceStreams (sliders)
 * and BananaShowers (spinners) are containers: they emit no judgement and are flattened
 * into these nested objects during conversion, never represented after.
 *
 * The position-generation pass (`applyPositionOffsets`, a port of lazer's
 * CatchBeatmapProcessor) fills `xOffset` + the derived `effectiveX`, `hyperDash`,
 * `distanceToHyperDash`, `hyperDashTargetX` — all mutated in place.
 * Before that pass `xOffset` is 0, `effectiveX = clamp(originalX, 0, 512)`, `hyperDash` false.
 * `originalX` is the raw beatmap/path X:
 *  - fruit (from a HitCircle): the circle's X.
 *  - fruit/droplet/tinyDroplet (nested in a JuiceStream): the head's clamped EffectiveX plus
 *    the path X at the event's progress (catch is 1-D — only the X axis is used).
 *  - banana: 0 — a banana has no base position; its whole X is the random `xOffset`
 *    assigned by the position pass.
 */
export interface CatchObject {
  readonly type: CatchObjectType;
  readonly startTime: number;
  /** Raw beatmap/path X before the processor's `xOffset`. */
  readonly originalX: number;
  /** Processor position jitter (CatchBeatmapProcessor). Filled by applyPositionOffsets; 0 before. */
  xOffset: number;
  /** clamp(originalX + xOffset, 0, 512), fround — the gameplay X judgement reads. */
  effectiveX: number;
  /** CalculateScaleFromCircleSize(cs), applyFudge=false; fruit/droplet sprite scale. */
  readonly scale: number;
  /** Source .osu hit-object index. Shared by all nested children of a JuiceStream/
   *  BananaShower. */
  readonly sourceIndex: number;
  /** `CatchHitObject.IndexInBeatmap`: the 0-based rank of this object's TOP-LEVEL parent
   *  among the converted CatchHitObjects, in beatmap order. All nested children of a
   *  JuiceStream/BananaShower inherit the parent's index (matches
   *  `CatchBeatmapProcessor.PostProcess`). Drives fruit sprite variety (`% 4`) and combo
   *  colour (`+ 1`) — both rendering concerns. */
  readonly indexInBeatmap: number;
  readonly hitSound: number;
  /** Banana-only: sequential index within its shower. */
  readonly bananaIndex?: number;
  /** Hyperdash (red fruit): the catcher can't reach the next object at dash speed.
   *  Only fruit / non-tiny droplets participate; false otherwise. */
  hyperDash: boolean;
  /** Slack px to the next object before a hyperdash would be required (rendering aid). */
  distanceToHyperDash: number;
  /** EffectiveX of the hyperdash target (the next palpable object), when `hyperDash`. */
  hyperDashTargetX?: number;
}

/**
 * Everything the catch ruleset derives from one beatmap + replay pair: the converted
 * object list, the decoded catcher path, per-object judgements, and the score/acc/combo
 * timelines the HUD reads. Built once by `catchRuleset.build`; treated as immutable after.
 */
export interface CatchSession {
  readonly beatmap: BeatmapData;
  readonly replay: ReplayData;
  readonly modDiff: ModDifficulty;
  readonly skin: SkinAssets;

  /** Flat palpable list in generation order (top-level beatmap order, nested in the order the
   *  generators emit them). The position pass walks this order — it is RNG-load-bearing; the
   *  startTime-sorted view used by rendering/judgement is derived separately. */
  readonly objects: readonly CatchObject[];

  /** Decoded catcher path: per-frame { time, x, dash }, time-sorted, with the raw 0..512 X
   *  (clamped only at sample time via sampleCatcherX). Judgement and the catcher render
   *  sample this. */
  readonly catcherPath: readonly CatcherFrame[];

  readonly hitResults:  readonly HitResult[];
  readonly accFrames:   readonly AccFrame[];
  readonly comboFrames: readonly ComboFrame[];
  readonly scoreFrames: readonly ScoreFrame[];
  readonly urTimeline:  URTimeline;
}
