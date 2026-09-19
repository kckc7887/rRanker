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
import { sampleSlider as sampleSliderStable } from './SliderGeometry';

type Point = { x: number; y: number };

// Lazer-flavoured sibling to SliderGeometry (the stable-behaviour module). The load-bearing
// stable-vs-lazer differences that justify the split:
//   (1) tick generation: stable uses time-based iteration with a 1ms safety cutoff, lazer
//       uses distance-based iteration with d ≤ length;
//   (2) span reversal: stable reverses path generation, lazer mirrors at sample time;
//   (3) any future divergences (arc tessellation, CS) land here without touching the
//       stable path.

/**
 * Lazer-model slider path sampling. Lazer's "more detail for circular arcs" refinement is
 * a no-op under JS float64 (sampling is already pixel-accurate), so this delegates to the
 * stable sampler; the entry point exists so callers can pick the model explicitly.
 */
export function sampleSliderLazer(slider: Slider): Point[] {
  return sampleSliderStable(slider);
}

/**
 * Lazer-model slider tick times (ms): distance-based iteration with d ≤ length per span,
 * where a 1ms epsilon on the span end avoids ticks landing on the tail boundary.
 */
export function sliderTickTimesLazer(
  beatmap: BeatmapData,
  slider: Slider,
  slideDur: number,
): number[] {
  let baseBeatLength = 500;
  for (const tp of beatmap.timingPoints) {
    if (tp.time > slider.time) break;
    if (!tp.inherited) baseBeatLength = tp.beatLength;
  }

  const tickInterval = baseBeatLength / beatmap.sliderTickRate;
  if (!isFinite(tickInterval) || tickInterval <= 0) return [];

  const ticks: number[] = [];
  for (let slide = 0; slide < slider.slides; slide++) {
    const slideStart = slider.time + slide * slideDur;
    for (let k = 1; k * tickInterval <= slideDur - 1; k++) {
      ticks.push(slideStart + k * tickInterval);
    }
  }
  return ticks;
}

/**
 * Lazer-model slider-ball position at `timeMs`: repeats are handled by mirroring the
 * progress fraction on odd spans at sample time (per danser's PositionAtLazer,
 * math.Mod(progress, 2)) rather than by reversing the generated path.
 */
export function sliderBallPosLazer(
  path: Point[],
  timeMs: number,
  sliderStartTime: number,
  slideDur: number,
  slides: number,
): Point {
  const elapsed = timeMs - sliderStartTime;
  const slideF = Math.max(0, Math.min(slides, elapsed / slideDur));
  const slideIdx = Math.min(Math.floor(slideF), slides - 1);
  let frac = slideF - slideIdx;
  if (slideIdx % 2 === 1) frac = 1 - frac;
  return pointAtFraction(path, frac);
}

function pointAtFraction(path: Point[], t: number): Point {
  if (path.length === 0) return { x: 0, y: 0 };
  if (t <= 0 || path.length === 1) return { ...path[0]! };
  if (t >= 1) return { ...path[path.length - 1]! };
  const idx  = t * (path.length - 1);
  const lo   = Math.floor(idx);
  const hi   = Math.min(lo + 1, path.length - 1);
  const frac = idx - lo;
  return {
    x: path[lo]!.x + (path[hi]!.x - path[lo]!.x) * frac,
    y: path[lo]!.y + (path[hi]!.y - path[lo]!.y) * frac,
  };
}
