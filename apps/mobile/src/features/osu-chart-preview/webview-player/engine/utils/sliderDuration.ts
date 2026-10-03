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

// Slider duration depends only on (beatmap, slider), both stable after parsing.
// Memoized per-slider so per-frame callers stop re-scanning timingPoints linearly.
const _durationCache = new WeakMap<Slider, number>();
const DEFAULT_EDGE_SET = Object.freeze({ normalSet: 0, additionSet: 0 });

/** Legacy NaN difficulty points disable ticks but retain normal slider velocity. */
export function sliderVelocityMultiplier(beatLength: number): number {
  return beatLength < 0 ? Math.max(0.1, Math.min(10, -100 / beatLength)) : 1;
}

/** Missing edges inherit defaults without allocating one row per repeat. */
export function sliderEdgeSample(slider: Slider, index: number): { hitSound: number; normalSet: number; additionSet: number } {
  return { hitSound: slider.edgeSounds[index] ?? slider.hitSound, ...(slider.edgeSets[index] ?? DEFAULT_EDGE_SET) };
}

export type SliderNestedEvent = { t: number; kind: 'tick' | 'repeat' | 'tail' };

/** Ordered nested events, retaining stable accumulation and lazer boundary semantics without repeat-sized buffers. */
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

/**
 * Duration of ONE slide of a slider in beatmap ms:
 * `length / (100 * sliderMultiplier * SV / baseBeatLength)`, using the timing
 * point active at the slider's start. Total active duration = this × `slides`.
 */
export function slideDurationMs(beatmap: BeatmapData, slider: Slider): number {
  const cached = _durationCache.get(slider);
  if (cached !== undefined) return cached;

  let baseBeatLength = 500; // fallback: 120 BPM
  let svMultiplier = 1;

  for (const tp of beatmap.timingPoints) {
    if (tp.time > slider.time) break;
    if (!tp.inherited) {
      baseBeatLength = tp.beatLength;
      // Red (uninherited) points reset SV to 1.0, matching osu!'s velocity model.
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
