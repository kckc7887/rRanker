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
import type { BeatmapData } from '../../types/index';

// Sequential scroll algorithm for osu!mania (ppy/osu master).
//
// mania uses ScrollVisualisationMethod.Sequential (the DrawableScrollingRuleset
// default; mania does not override it) with RelativeScaleBeatLengths => true.
// The per-segment scroll multiplier from MultiplierControlPoint is
//   Multiplier = Velocity · EffectPoint.ScrollSpeed · BaseBeatLength / TimingPoint.BeatLength
// with, for mania, Velocity = SliderMultiplier and
//   BaseBeatLength = GetMostCommonBeatLength() / SliderMultiplier,
// so the SliderMultiplier cancels and the net multiplier is
//   Multiplier = ScrollSpeed · mostCommonBeatLength / currentBeatLength.
//
// Legacy .osu maps encode SV only via green-line negative beatLength; the legacy
// decoder routes that into EffectControlPoint.ScrollSpeed (= 100 / -beatLength)
// for taiko/mania specifically. A red (uninherited) line resets ScrollSpeed to 1.
//
// SequentialScrollAlgorithm precomputes a cumulative position per control point
// (the cause of the visual speed/spacing change at SV/BPM boundaries that a
// constant-scroll renderer can't reproduce). We store a timeRange-independent
// `cumRaw` so the live scroll-speed slider only scales the final position.

const DEFAULT_BEAT_LENGTH = 1000; // TimingControlPoint.DEFAULT_BEAT_LENGTH (60 BPM)

/**
 * Precomputed Sequential-scroll control-point table (parallel arrays). Maps
 * beatmap time ↔ cumulative scroll position via scrollRawAt / scrollTimeAtRaw;
 * independent of the user's scroll-speed setting (which only scales positions).
 */
export interface ManiaScroll {
  /** Control-point times, ascending, deduped (last wins per time). length ≥ 1. */
  readonly times: readonly number[];
  /** Per-segment scroll multiplier (> 0). Same length as `times`. */
  readonly multipliers: readonly number[];
  /**
   * timeRange-independent cumulative position. cumRaw[0] = 0;
   * cumRaw[i] = cumRaw[i-1] + (times[i] - times[i-1]) · multipliers[i-1].
   * Monotonically increasing (multipliers > 0).
   */
  readonly cumRaw: readonly number[];
}

/**
 * Most common red-line beat length, weighted by the duration each is active for
 * (mirrors osu.Game/Beatmaps/Beatmap.cs GetMostCommonBeatLength). Only
 * uninherited (red) timing points participate. Falls back to DEFAULT_BEAT_LENGTH.
 */
function mostCommonBeatLength(beatmap: BeatmapData): number {
  const red = beatmap.timingPoints.filter(tp => !tp.inherited);
  if (red.length === 0) return DEFAULT_BEAT_LENGTH;

  let lastTime = 0;
  for (const obj of beatmap.hitObjects) {
    const t = obj.type === 'spinner' ? obj.endTime : obj.time;
    if (t > lastTime) lastTime = t;
  }
  for (const h of beatmap.maniaHolds) if (h.endTime > lastTime) lastTime = h.endTime;

  const durByLen = new Map<number, number>();
  for (let i = 0; i < red.length; i++) {
    const tp = red[i]!;
    const currentTime = i === 0 ? 0 : tp.time;
    const nextTime = i === red.length - 1 ? lastTime : red[i + 1]!.time;
    const key = Math.round(tp.beatLength * 1000) / 1000;
    durByLen.set(key, (durByLen.get(key) ?? 0) + (nextTime - currentTime));
  }
  let bestLen = DEFAULT_BEAT_LENGTH;
  let bestDur = -Infinity;
  for (const [len, dur] of durByLen) {
    if (dur > bestDur) { bestDur = dur; bestLen = len; }
  }
  return bestLen > 0 ? bestLen : DEFAULT_BEAT_LENGTH;
}

/**
 * Build the Sequential-scroll control-point table for a mania beatmap. Walks all
 * timing points in time order, tracking the current red-line beat length (BPM)
 * and the current green-line scroll speed (reset to 1 at each red line), and
 * emits {time, multiplier} at each. Independent of the user scroll-speed slider.
 */
export function buildManiaScroll(beatmap: BeatmapData): ManiaScroll {
  const tps = beatmap.timingPoints; // already sorted; red precedes green at equal times
  const mostCommon = mostCommonBeatLength(beatmap);

  const times: number[] = [];
  const multipliers: number[] = [];
  let currentBeatLength = DEFAULT_BEAT_LENGTH;
  let currentScrollSpeed = 1;

  for (const tp of tps) {
    if (tp.inherited) {
      currentScrollSpeed = tp.beatLength < 0 ? 100 / -tp.beatLength : 1;
    } else {
      currentBeatLength = tp.beatLength > 0 ? tp.beatLength : DEFAULT_BEAT_LENGTH;
      currentScrollSpeed = 1; // a red line resets ScrollSpeed to its default
    }
    const mult = currentScrollSpeed * mostCommon / currentBeatLength;
    // Dedupe equal times: last control point at a given time wins (matches lazer's
    // dedupe-by-Time). The zero-length segment would contribute nothing anyway.
    if (times.length > 0 && times[times.length - 1] === tp.time) {
      multipliers[multipliers.length - 1] = mult;
    } else {
      times.push(tp.time);
      multipliers.push(mult);
    }
  }

  if (times.length === 0) { times.push(0); multipliers.push(1); }

  const cumRaw: number[] = new Array(times.length);
  cumRaw[0] = 0;
  for (let i = 1; i < times.length; i++) {
    cumRaw[i] = cumRaw[i - 1]! + (times[i]! - times[i - 1]!) * multipliers[i - 1]!;
  }

  return { times, multipliers, cumRaw };
}

/** Largest index k with arr[k] ≤ key, clamped to 0 (extrapolate the first segment backward). */
function lastIndexLE(arr: readonly number[], key: number): number {
  if (key < arr[0]!) return 0;
  let lo = 0, hi = arr.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    if (arr[mid]! <= key) lo = mid; else hi = mid - 1;
  }
  return lo;
}

/** Cumulative (timeRange-independent) scroll position at beatmap time `t`. Monotonic in `t`. */
export function scrollRawAt(scroll: ManiaScroll, t: number): number {
  const k = lastIndexLE(scroll.times, t);
  return scroll.cumRaw[k]! + (t - scroll.times[k]!) * scroll.multipliers[k]!;
}

/** Inverse of scrollRawAt: the beatmap time whose cumulative position is `raw`. */
export function scrollTimeAtRaw(scroll: ManiaScroll, raw: number): number {
  const k = lastIndexLE(scroll.cumRaw, raw);
  return scroll.times[k]! + (raw - scroll.cumRaw[k]!) / scroll.multipliers[k]!;
}
