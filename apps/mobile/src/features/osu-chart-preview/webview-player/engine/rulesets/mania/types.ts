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
import type { BeatmapData, ReplayData, SkinAssets, HitResult, HitSample } from '../../types/index';
import type { ModDifficulty } from '../../utils/modDifficulty';
import type { AccFrame, ComboFrame } from '../../renderer/HUDRenderer';
import type { ScoreFrame } from '../../utils/scoreProcessor';
import type { URTimeline } from '../../renderer/URBarRenderer';
import type { ManiaInputEvent } from './input';
import type { ManiaLayout } from './Playfield';
import type { ManiaHoldState } from './hitJudge';
import type { ManiaScroll } from './scroll';

// Mania hit objects (post-conversion). The converter assigns column indices to the
// raw HitCircle/ManiaHold records the .osu parser produces.

/** A single tap note, with time in ms and a 0-based absolute column index. */
export interface ManiaNote {
  kind: 'note';
  time: number;
  column: number;
  hitSound: number;
  hitSample: HitSample;
  /** Index into beatmap.hitObjects (for popup/judgement back-references). */
  sourceIndex: number;
}

/**
 * A hold note (long note) spanning [startTime, endTime] ms in one column.
 * Per ppy/osu HoldNote.CreateNestedHitObjects: head + tail are judged independently,
 * body is an invisible tracker for hold-breaks. The parent hold is not directly judged.
 */
export interface ManiaHoldNote {
  kind: 'hold';
  startTime: number;
  endTime: number;
  column: number;
  hitSound: number;
  hitSample: HitSample;
  sourceIndex: number;
}

/** Any judgeable mania object: a tap note or a hold note. */
export type ManiaHitObject = ManiaNote | ManiaHoldNote;

/** A beat line drawn across the stage (generated from the map's timing points). */
export interface ManiaBarLine {
  time: number;
  /** First beat of a measure — drawn thicker/brighter. */
  major: boolean;
}

/** One column group. Only single-stage layouts are currently produced. */
export interface ManiaStage {
  /** Column count for this stage. */
  columns: number;
  /** Absolute index of this stage's first column. */
  firstColumnIndex: number;
}

/**
 * Immutable, fully precomputed state for one mania replay: converted objects,
 * decoded input, playfield layout, scroll table, judgements, and HUD timelines.
 * Built once by the mania ruleset's `build`; all render/query paths read from it.
 */
export interface ManiaSession {
  readonly beatmap: BeatmapData;
  readonly replay: ReplayData;
  readonly modDiff: ModDifficulty;
  readonly skin: SkinAssets;

  readonly stages: readonly ManiaStage[];
  readonly totalColumns: number;
  /**
   * Skin-requested scroll direction (`UpsideDown: 1` in the matched [Mania] section).
   * Seeds the user-flippable Upscroll render option at construction; not consumed here.
   */
  readonly defaultUpscroll: boolean;
  /** Sorted by start time; ties broken by column index. */
  readonly objects: readonly ManiaHitObject[];
  readonly barLines: readonly ManiaBarLine[];
  /** Per-column press/release edges decoded from the replay's MouseX bitmask. */
  readonly inputEvents: readonly ManiaInputEvent[];
  /** Static playfield geometry (column widths/positions, hit-line Y). */
  readonly layout: ManiaLayout;
  /**
   * Sequential-scroll control points (BPM + SV → per-segment multiplier). Drives
   * note positioning so SV/BPM changes reproduce the in-game speed/spacing shifts.
   * Built once; independent of the live scroll-speed slider.
   */
  readonly scroll: ManiaScroll;
  /**
   * Maximum hold duration on the map, in ms. Used by the visible-range search
   * to look back far enough that a long hold whose start has already scrolled
   * past the hit line is still rendered (objects are sorted by START time, so
   * a long active hold can have an arbitrarily early sourceIndex).
   */
  readonly maxHoldDurationMs: number;

  /**
   * Per-hold judgement state: press/release times, head judgement, and whether
   * the body broke. Keyed by ManiaHoldNote.sourceIndex. The Playfield consumes
   * this to freeze the head at the hit line and shrink the body while held.
   */
  readonly holdStates: ReadonlyMap<number, ManiaHoldState>;

  /**
   * Per-column press intervals derived from inputEvents. Used by the visual
   * feedback layer to drive key-receptor down sprites and stage press-lights.
   * `end === Number.POSITIVE_INFINITY` for a column that was never released.
   * Intervals are sorted by `start`; non-overlapping within a column.
   */
  readonly pressIntervals: readonly (readonly { start: number; end: number }[])[];

  /** sourceIndex → column. Used to attribute hit results to columns for popups/explosions. */
  readonly objectIndexToColumn: ReadonlyMap<number, number>;

  /**
   * sourceIndex → HitSample. Drives per-press hitsound lookup in AudioSync. Holds use
   * indices outside `beatmap.hitObjects` (the parser puts them in `maniaHolds`), so
   * the std fallback `this.beatmap.hitObjects[result.objectIndex]` doesn't work for
   * HoldNote head/tail subResults — this map closes that gap.
   */
  readonly samplesBySource: ReadonlyMap<number, HitSample>;

  readonly hitResults:  readonly HitResult[];
  /**
   * Tap-note sourceIndex → its HitResult (only entries for `kind: 'note'` —
   * HoldNote sub-results are out of scope for this map). Used by the
   * Playfield to cull tap notes that have already been judged non-miss:
   * lazer's `DrawableManiaHitObject.UpdateHitStateTransforms` does an
   * instant `FadeOut()` on `ArmedState.Hit`, so the note disappears at
   * press time. Missed taps stay in this map but with `judgement === 0`,
   * and the Playfield lets them scroll past normally.
   */
  readonly noteResultByIndex: ReadonlyMap<number, HitResult>;
  readonly accFrames:   readonly AccFrame[];
  readonly comboFrames: readonly ComboFrame[];
  readonly scoreFrames: readonly ScoreFrame[];
  readonly urTimeline:  URTimeline;
}
