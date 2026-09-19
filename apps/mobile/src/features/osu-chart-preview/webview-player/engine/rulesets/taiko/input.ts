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

/** One of the four taiko keys. Matches TaikoAction enum order in osu.Game.Rulesets.Taiko/TaikoAction.cs. */
export type TaikoAction = 'LeftRim' | 'LeftCentre' | 'RightCentre' | 'RightRim';

/** A single key press (rising edge only) at `time` ms on the beatmap clock. */
export interface TaikoInputEvent {
  time: number;
  action: TaikoAction;
}

// Stable .osr bitfield: bit 0=LeftCentre, 1=LeftRim, 2=RightCentre, 3=RightRim.
const BIT_TO_ACTION: readonly { bit: number; action: TaikoAction }[] = [
  { bit: 1, action: 'LeftCentre'  },
  { bit: 2, action: 'LeftRim'     },
  { bit: 4, action: 'RightCentre' },
  { bit: 8, action: 'RightRim'    },
];

/**
 * Extract rising-edge key presses from a taiko replay's raw frames, sorted by
 * time. Accumulates timeDelta including negatives — lazer encodes audio lead-in
 * as the first frame's negative delta, and dropping it shifts the whole timeline
 * forward past every hit window.
 */
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
