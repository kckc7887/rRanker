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
import type { BeatmapData, Slider } from '../types/index';

const _durationCache = new WeakMap<Slider, number>();
const DEFAULT_EDGE_SET = Object.freeze({ normalSet: 0, additionSet: 0 });

/** NaN 难度点禁用 tick，但保持正常 SV。 */
export function sliderVelocityMultiplier(beatLength: number): number {
  return beatLength < 0 ? Math.max(0.1, Math.min(10, -100 / beatLength)) : 1;
}

export function sliderEdgeSample(slider: Slider, index: number): { hitSound: number; normalSet: number; additionSet: number } {
  return { hitSound: slider.edgeSounds[index] ?? slider.hitSound, ...(slider.edgeSets[index] ?? DEFAULT_EDGE_SET) };
}

export type SliderNestedEvent = { t: number; kind: 'tick' | 'repeat' | 'tail' };

export function* sliderNestedEvents(beatmap: BeatmapData, slider: Slider, slideDur: number, isLazer: boolean): Generator<SliderNestedEvent> {
  let baseBeatLength = 500;
  let generateTicks = true;
  for (const tp of beatmap.timingPoints) {
    if (tp.time > slider.time) break;
    if (!tp.inherited) baseBeatLength = tp.beatLength;
    generateTicks = !Number.isNaN(tp.beatLength);
  }
  const interval = baseBeatLength / beatmap.sliderTickRate;
  const hasTicks = generateTicks && Number.isFinite(interval) && interval > 0;
  for (let slide = 0; slide < slider.slides; slide++) {
    const start = slider.time + slide * slideDur;
    if (hasTicks) {
      if (isLazer) {
        for (let k = 1; k * interval <= slideDur - 1; k++) yield { t: start + k * interval, kind: 'tick' };
      } else {
        for (let t = start + interval; t < start + slideDur - 1; t += interval) yield { t, kind: 'tick' };
      }
    }
    if (slide < slider.slides - 1) yield { t: slider.time + slideDur * (slide + 1), kind: 'repeat' };
  }
  yield { t: slider.time + slideDur * slider.slides, kind: 'tail' };
}

/** 单段时间(ms)=length/(100×SliderMultiplier×SV/baseBeatLength)。 */
export function slideDurationMs(beatmap: BeatmapData, slider: Slider): number {
  const cached = _durationCache.get(slider);
  if (cached !== undefined) return cached;

  let baseBeatLength = 500;
  let svMultiplier = 1;

  for (const tp of beatmap.timingPoints) {
    if (tp.time > slider.time) break;
    if (!tp.inherited) {
      baseBeatLength = tp.beatLength;

      svMultiplier = 1;
    } else {
      svMultiplier = sliderVelocityMultiplier(tp.beatLength);
    }
  }

  const velocity = (100 * beatmap.sliderMultiplier * svMultiplier) / baseBeatLength;
  const duration = velocity > 0 ? slider.length / velocity : 1000;
  _durationCache.set(slider, duration);
  return duration;
}
