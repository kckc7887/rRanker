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
import type { ReplayFrame } from '../types/index';

/** 回放时长按裁剪区间与 Mod 速度换算，单位 ms；最短 1000ms。 */
export class TimeMapper {
  readonly introOffsetMs: number;
  readonly outroOffsetMs: number;
  readonly mapDurationMs: number;
  readonly speed: number;
  readonly presentationDurationMs: number;

  constructor(frames: ReplayFrame[], introOffsetMs = 0, outroOffsetMs = 0, speed = 1) {
    let cumTime = 0;
    for (const frame of frames) {
      if (frame.timeDelta >= 0) cumTime += frame.timeDelta;
    }

    this.mapDurationMs = cumTime;
    this.speed = speed;

    const maxTrim = Math.max(0, cumTime - 1000);
    this.introOffsetMs  = Math.max(0, Math.min(introOffsetMs, maxTrim));
    this.outroOffsetMs  = Math.max(0, Math.min(outroOffsetMs, maxTrim - this.introOffsetMs));
    this.presentationDurationMs = Math.max(1000,
      (cumTime - this.introOffsetMs - this.outroOffsetMs) / speed);
  }

  toMapTime(presentationMs: number): number {
    return presentationMs * this.speed + this.introOffsetMs;
  }
}
