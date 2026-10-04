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

export type CatchObjectType = 'fruit' | 'droplet' | 'tinyDroplet' | 'banana';

export interface CatchObject {
  readonly type: CatchObjectType;
  readonly startTime: number;

  readonly originalX: number;

  xOffset: number;
  /** float32 的 clamp(originalX+xOffset,0,512)。 */
  effectiveX: number;

  readonly scale: number;
  /** 同一滑条或香蕉雨的子物件共享源索引。 */
  readonly sourceIndex: number;

  readonly indexInBeatmap: number;
  readonly hitSound: number;

  readonly bananaIndex?: number;

  hyperDash: boolean;

  distanceToHyperDash: number;

  hyperDashTargetX?: number;
}

export interface CatchSession {
  readonly beatmap: BeatmapData;
  readonly replay: ReplayData;
  readonly modDiff: ModDifficulty;
  readonly skin: SkinAssets;

  /** 按生成顺序保存；位置计算的随机流依赖此顺序。 */
  readonly objects: readonly CatchObject[];

  readonly catcherPath: readonly CatcherFrame[];

  readonly hitResults:  readonly HitResult[];
  readonly accFrames:   readonly AccFrame[];
  readonly comboFrames: readonly ComboFrame[];
  readonly scoreFrames: readonly ScoreFrame[];
  readonly urTimeline:  URTimeline;
}
