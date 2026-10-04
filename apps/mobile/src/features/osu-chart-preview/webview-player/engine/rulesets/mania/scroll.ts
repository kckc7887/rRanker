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

/** Sequential 滚动倍率=ScrollSpeed×最常见节拍长度/当前节拍长度。 */

/** 绿线编码 SV，红线将 ScrollSpeed 重置为 1。 */

const DEFAULT_BEAT_LENGTH = 1000;

export interface ManiaScroll {

  readonly times: readonly number[];

  readonly multipliers: readonly number[];
  /** cumRaw 为不含用户滚速的累计位置，各段按持续时间×倍率积分。 */
  readonly cumRaw: readonly number[];
}

/** 最常见节拍长度按各红线有效时长加权。 */
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

export function buildManiaScroll(beatmap: BeatmapData): ManiaScroll {
  const tps = beatmap.timingPoints;
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
      currentScrollSpeed = 1;
    }
    const mult = currentScrollSpeed * mostCommon / currentBeatLength;

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

function lastIndexLE(arr: readonly number[], key: number): number {
  if (key < arr[0]!) return 0;
  let lo = 0, hi = arr.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    if (arr[mid]! <= key) lo = mid; else hi = mid - 1;
  }
  return lo;
}

export function scrollRawAt(scroll: ManiaScroll, t: number): number {
  const k = lastIndexLE(scroll.times, t);
  return scroll.cumRaw[k]! + (t - scroll.times[k]!) * scroll.multipliers[k]!;
}

export function scrollTimeAtRaw(scroll: ManiaScroll, raw: number): number {
  const k = lastIndexLE(scroll.cumRaw, raw);
  return scroll.times[k]! + (raw - scroll.cumRaw[k]!) / scroll.multipliers[k]!;
}
