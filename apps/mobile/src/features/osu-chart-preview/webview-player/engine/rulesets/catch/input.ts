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
import type { ReplayData } from '../../types/index';

export interface CatcherFrame {

  readonly time: number;
  /** 原始 MouseX 用 0..512 osu!px，插值后再限幅。 */
  readonly x: number;

  readonly dash: boolean;
}

const WIDTH = 512;
const CENTER_X = 256;
const DASH_STATE = 1;

/** 累积负前导时间；stable 的 y=-500 占位仅贡献时间，不生成位置。 */
export function catchFrames(replay: ReplayData): CatcherFrame[] {
  const path: CatcherFrame[] = [];
  let cumTime = 0;
  for (let i = 0; i < replay.frames.length; i++) {
    const f = replay.frames[i]!;
    cumTime += f.timeDelta;
    if (i < 2 && f.x === CENTER_X && f.y === -500) continue;
    path.push({ time: cumTime, x: f.x, dash: f.keys === DASH_STATE });
  }
  return path;
}

function clampX(x: number): number {
  return x < 0 ? 0 : x > WIDTH ? WIDTH : x;
}

/** 范围外保持端点位置；范围内先插值，再限幅。 */
export function sampleCatcherX(path: readonly CatcherFrame[], time: number): number {
  const n = path.length;
  if (n === 0) return CENTER_X;
  if (time <= path[0]!.time) return clampX(path[0]!.x);
  const last = path[n - 1]!;
  if (time >= last.time) return clampX(last.x);

  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (path[mid]!.time <= time) lo = mid;
    else hi = mid;
  }
  const a = path[lo]!;
  const b = path[lo + 1]!;
  const dt = b.time - a.time;
  const frac = dt <= 0 ? 0 : (time - a.time) / dt;
  return clampX(a.x + (b.x - a.x) * frac);
}
