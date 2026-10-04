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

export interface ManiaNote {
  kind: 'note';
  time: number;
  column: number;
  hitSound: number;
  hitSample: HitSample;

  sourceIndex: number;
}

export interface ManiaHoldNote {
  kind: 'hold';
  startTime: number;
  endTime: number;
  column: number;
  hitSound: number;
  hitSample: HitSample;
  sourceIndex: number;
}

export type ManiaHitObject = ManiaNote | ManiaHoldNote;

export interface ManiaBarLine {
  time: number;

  major: boolean;
}

export interface ManiaStage {

  columns: number;

  firstColumnIndex: number;
}

export interface ManiaSession {
  readonly beatmap: BeatmapData;
  readonly replay: ReplayData;
  readonly modDiff: ModDifficulty;
  readonly skin: SkinAssets;

  readonly stages: readonly ManiaStage[];
  readonly totalColumns: number;

  readonly defaultUpscroll: boolean;

  readonly objects: readonly ManiaHitObject[];
  readonly barLines: readonly ManiaBarLine[];

  readonly inputEvents: readonly ManiaInputEvent[];

  readonly layout: ManiaLayout;

  readonly scroll: ManiaScroll;

  readonly maxHoldDurationMs: number;

  readonly holdStates: ReadonlyMap<number, ManiaHoldState>;

  /** 未松开的区间以正无穷结束。 */
  readonly pressIntervals: readonly (readonly { start: number; end: number }[])[];

  readonly objectIndexToColumn: ReadonlyMap<number, number>;

  /** hold 索引不在 hitObjects 内，音效按 sourceIndex 单独映射。 */
  readonly samplesBySource: ReadonlyMap<number, HitSample>;

  readonly hitResults:  readonly HitResult[];

  readonly noteResultByIndex: ReadonlyMap<number, HitResult>;
  readonly accFrames:   readonly AccFrame[];
  readonly comboFrames: readonly ComboFrame[];
  readonly scoreFrames: readonly ScoreFrame[];
  readonly urTimeline:  URTimeline;
}
