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
      svMultiplier = Math.max(0.1, Math.min(10, -100 / tp.beatLength));
    }
  }

  const velocity = (100 * beatmap.sliderMultiplier * svMultiplier) / baseBeatLength;
  const duration = velocity > 0 ? slider.length / velocity : 1000;
  _durationCache.set(slider, duration);
  return duration;
}
