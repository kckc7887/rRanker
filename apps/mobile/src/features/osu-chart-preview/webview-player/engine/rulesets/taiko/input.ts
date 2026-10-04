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

export type TaikoAction = 'LeftRim' | 'LeftCentre' | 'RightCentre' | 'RightRim';

export interface TaikoInputEvent {
  time: number;
  action: TaikoAction;
}

/** stable 位掩码：bit0 左中心、bit1 左边缘、bit2 右中心、bit3 右边缘。 */
const BIT_TO_ACTION: readonly { bit: number; action: TaikoAction }[] = [
  { bit: 1, action: 'LeftCentre'  },
  { bit: 2, action: 'LeftRim'     },
  { bit: 4, action: 'RightCentre' },
  { bit: 8, action: 'RightRim'    },
];

/** 负前导 delta 仍参与时间累加。 */
export function taikoFrames(replay: ReplayData): TaikoInputEvent[] {
  const events: TaikoInputEvent[] = [];
  let cumTime = 0;
  let prevKeys = 0;
  for (const frame of replay.frames) {
    cumTime += frame.timeDelta;
    const curKeys = frame.keys & 0b1111;
    const newPresses = curKeys & ~prevKeys;
    if (newPresses !== 0) {
      for (const { bit, action } of BIT_TO_ACTION) {
        if (newPresses & bit) events.push({ time: cumTime, action });
      }
    }
    prevKeys = curKeys;
  }
  return events;
}
