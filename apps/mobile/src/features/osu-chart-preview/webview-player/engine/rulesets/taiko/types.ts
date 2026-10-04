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
import type { BeatmapData, ReplayData, HitResult, SkinAssets } from '../../types/index';
import type { ModDifficulty } from '../../utils/modDifficulty';
import type { TaikoInputEvent } from './input';
import type { AccFrame, ComboFrame } from '../../renderer/HUDRenderer';
import type { ScoreFrame } from '../../utils/scoreProcessor';
import type { URTimeline } from '../../renderer/URBarRenderer';
import type { TaikoFlashlight } from './Flashlight';

export type TaikoHitObject = TaikoHit | TaikoDrumRoll | TaikoSwell;

export interface TaikoHit {
  kind: 'hit';
  time: number;
  isRim: boolean;

  isStrong: boolean;
  hitSound: number;
  /** 同一滑条转换的多颗音符共享源索引。 */
  sourceIndex: number;

  noteId: number;
}

export interface TaikoDrumRoll {
  kind: 'drumroll';
  time: number;
  endTime: number;
  isStrong: boolean;
  hitSound: number;

  tickCount: number;

  tickInterval: number;
  sourceIndex: number;
}

export interface TaikoSwell {
  kind: 'swell';
  time: number;
  endTime: number;
  requiredHits: number;
  hitSound: number;
  sourceIndex: number;
}

export interface TaikoSession {
  readonly beatmap: BeatmapData;
  readonly replay: ReplayData;
  readonly modDiff: ModDifficulty;
  readonly skin: SkinAssets;
  readonly objects: readonly TaikoHitObject[];
  readonly inputEvents: readonly TaikoInputEvent[];

  readonly ghostTaps: readonly TaikoInputEvent[];
  readonly barLines: readonly number[];
  /** 每颗音符使用起始时刻的滚速，途中 BPM/SV 变化不改变它。 */
  readonly objectVel: readonly number[];
  readonly barLineVel: readonly number[];

  readonly maxScrollMs: number;
  readonly hitResults: readonly HitResult[];
  readonly accFrames: readonly AccFrame[];
  readonly comboFrames: readonly ComboFrame[];
  readonly scoreFrames: readonly ScoreFrame[];
  readonly urTimeline: URTimeline;
  readonly swellProgress: ReadonlyMap<number, SwellProgress>;

  readonly hitJudgmentByNote: ReadonlyMap<number, { time: number; judgement: number }>;
  readonly flashlight: TaikoFlashlight | null;
}

export interface SwellProgress {
  readonly tickTimes: readonly number[];
  readonly completionTime?: number;
}
