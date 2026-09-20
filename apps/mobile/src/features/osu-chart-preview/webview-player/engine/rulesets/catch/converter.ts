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
import type { BeatmapData, Slider, Spinner, HitCircle } from '../../types/index';
import type { ModDifficulty } from '../../utils/modDifficulty';
import type { CatchObject, CatchObjectType } from './types';
import { sampleSlider } from '../../renderer/SliderGeometry';

/**
 * Port of osu.Game.Rulesets.Catch.Beatmaps.CatchBeatmapConverter + the nested-object
 * generators (JuiceStream.CreateNestedHitObjects via SliderEventGenerator, and
 * BananaShower.createBananas). Produces the flat palpable object list.
 *
 * Position generation (the LegacyRandom XOffset/hyperdash pass) is a separate step
 * (`applyPositionOffsets`) — every object here carries xOffset = 0. There is no
 * native-vs-convert branch: the converter switches on the interface each object implements
 * (HitCircle→Fruit, Slider→JuiceStream, Spinner→BananaShower), identical for mode-2 maps
 * and std→catch converts.
 *
 * Cast discipline: C# `float` ops via Math.fround, C# `(int)` truncation via Math.trunc,
 * everything else double. The float/int ordering is load-bearing — tick/tiny/banana COUNTS
 * drift from the replay if it slips.
 */

const BASE_SCORING_DISTANCE = 100;     // JuiceStream.base_scoring_distance
const CATCH_WIDTH = 512;               // CatchPlayfield.WIDTH
const TAIL_LENIENCY = -36;             // SliderEventGenerator.TAIL_LENIENCY
const MAX_LENGTH = 100000;             // SliderEventGenerator.max_length

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * LegacyRulesetExtensions.CalculateScaleFromCircleSize(cs, applyFudge: false) for catch.
 * DifficultyRange(cs, -1, 0, 1) == (cs - 5) / 5; no 1.00041 fudge allowance.
 * Fruit/droplet sprite scale; also feeds the catcher width / hyperdash pass.
 */
export function calculateScaleFromCircleSize(cs: number): number {
  return Math.fround((1.0 - 0.7 * (cs - 5) / 5) / 2);
}

const CATCHER_BASE_SIZE = 106.75;     // Catcher.BASE_SIZE
const ALLOWED_CATCH_RANGE = 0.8;      // Catcher.ALLOWED_CATCH_RANGE

/**
 * Catcher.CalculateCatchWidth(difficulty) = BASE_SIZE · |scaleX| · ALLOWED_CATCH_RANGE,
 * scaleX = CalculateScaleFromCircleSize(cs) · 2 (the catcher doubles the fruit scale).
 * The catch range (osu-px) both the hyperdash pass and the judgement overlap test read.
 */
export function calculateCatchWidth(cs: number): number {
  const scaleX = Math.abs(calculateScaleFromCircleSize(cs) * 2);
  return Math.fround(CATCHER_BASE_SIZE * scaleX * ALLOWED_CATCH_RANGE);
}

// Active base beat length + slider-velocity multiplier at `time`. Mirrors the shared
// slider-duration helper / the taiko converter so all rulesets agree on the timing point.
//
// Pre-first-timing-point clamp: lazer's `ControlPointInfo.TimingPointAt`
// is a BinarySearchWithFallback to `TimingPoints[0]`, so an object that precedes the opening
// timing point still uses that point's beatLength — NOT the 500ms hard default. (Maps often
// set the first timing point 1ms after the first object; without this clamp the opening
// slider's velocity/duration — and therefore its tail time + tiny-droplet count — are wrong.)
// `DifficultyPointAt` falls back to DEFAULT instead, so svMultiplier stays 1 before the first
// inherited point; both branches reset it the same way the loop does.
function getTimingAt(beatmap: BeatmapData, time: number): { baseBeatLength: number; svMultiplier: number } {
  const firstUninherited = beatmap.timingPoints.find((tp) => !tp.inherited);
  let baseBeatLength = firstUninherited ? firstUninherited.beatLength : 500;
  let svMultiplier = 1;
  for (const tp of beatmap.timingPoints) {
    if (tp.time > time) break;
    if (!tp.inherited) {
      baseBeatLength = tp.beatLength;
      svMultiplier = 1;
    } else {
      svMultiplier = Math.max(0.1, Math.min(10, -100 / tp.beatLength));
    }
  }
  return { baseBeatLength, svMultiplier };
}

// LegacyRulesetExtensions.GetPrecisionAdjustedBeatLength(this, timingPoint, "fruits").
// Catch/osu clamp the bpm multiplier to [10, 1000] (taiko/mania use [10, 10000]); the
// `(float)` cast on -sliderVelocityAsBeatLength is the load-bearing precision step.
function precisionAdjustedBeatLength(baseBeatLength: number, svMultiplier: number): number {
  const sliderVelocityAsBeatLength = -100 / svMultiplier;
  const bpmMultiplier = sliderVelocityAsBeatLength < 0
    ? clamp(Math.fround(-sliderVelocityAsBeatLength), 10, 1000) / 100.0
    : 1;
  return baseBeatLength * bpmMultiplier;
}

// SliderPath.PositionAt(progress).X, expressed relative to the slider head (lazer's path is
// head-relative; our sampleSlider returns absolute coords, so subtract the head X). Used only
// for object X — it does not affect any object COUNT.
function pathRelativeXAt(slider: Slider, progress: number): number {
  const pts = sampleSlider(slider);
  if (pts.length === 0) return 0;
  const headX = slider.x;
  if (pts.length === 1) return pts[0]!.x - headX;
  const p = clamp(progress, 0, 1);
  const idx = p * (pts.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.min(lo + 1, pts.length - 1);
  const frac = idx - lo;
  const x = pts[lo]!.x + (pts[hi]!.x - pts[lo]!.x) * frac;
  return x - headX;
}

type SliderEventType = 'head' | 'tick' | 'repeat' | 'legacyLastTick' | 'tail';
interface SliderEvent { type: SliderEventType; time: number; pathProgress: number; }

/**
 * Port of SliderEventGenerator.Generate. Emits Head → (per span: Ticks, then a Repeat unless
 * final) → LegacyLastTick → Tail, in time order. LegacyLastTick yields no catch object but
 * still advances `lastEvent` so it seeds the final tiny-droplet segment. All arithmetic
 * here is double (no float casts).
 */
function generateSliderEvents(
  startTime: number,
  spanDuration: number,
  velocity: number,
  tickDistance: number,
  totalDistance: number,
  spanCount: number,
): SliderEvent[] {
  const events: SliderEvent[] = [];
  const length = Math.min(MAX_LENGTH, totalDistance);
  const td = clamp(tickDistance, 0, length);
  const minDistanceFromEnd = velocity * 10;

  events.push({ type: 'head', time: startTime, pathProgress: 0 });

  for (let span = 0; span < spanCount; span++) {
    const spanStartTime = startTime + span * spanDuration;
    const reversed = span % 2 === 1;

    const ticks: SliderEvent[] = [];
    if (td !== 0) {
      for (let d = td; d <= length; d += td) {
        if (d >= length - minDistanceFromEnd) break;
        const pathProgress = d / length;
        const timeProgress = reversed ? 1 - pathProgress : pathProgress;
        ticks.push({ type: 'tick', time: spanStartTime + timeProgress * spanDuration, pathProgress });
      }
    }
    if (reversed) ticks.reverse();
    for (const t of ticks) events.push(t);

    if (span < spanCount - 1) {
      events.push({ type: 'repeat', time: spanStartTime + spanDuration, pathProgress: (span + 1) % 2 });
    }
  }

  const totalDuration = spanCount * spanDuration;
  const finalSpanStartTime = startTime + (spanCount - 1) * spanDuration;
  const legacyLastTickTime = Math.max(startTime + totalDuration / 2, (finalSpanStartTime + spanDuration) + TAIL_LENIENCY);
  let legacyLastTickProgress = (legacyLastTickTime - finalSpanStartTime) / spanDuration;
  if (spanCount % 2 === 0) legacyLastTickProgress = 1 - legacyLastTickProgress;
  events.push({ type: 'legacyLastTick', time: legacyLastTickTime, pathProgress: legacyLastTickProgress });

  events.push({ type: 'tail', time: startTime + totalDuration, pathProgress: spanCount % 2 });

  return events;
}

function makeNested(
  type: CatchObjectType,
  startTime: number,
  originalX: number,
  scale: number,
  sourceIndex: number,
  indexInBeatmap: number,
  hitSound: number,
): CatchObject {
  const ox = Math.fround(originalX);
  // xOffset/effectiveX/hyperDash/distanceToHyperDash hold pre-offset defaults; the
  // applyPositionOffsets pass overwrites xOffset + effectiveX for every object and the hyper
  // flags for the fruit/droplet subset (others keep these defaults).
  return {
    type,
    startTime,
    originalX: ox,
    xOffset: 0,
    effectiveX: Math.fround(clamp(ox, 0, CATCH_WIDTH)),
    scale,
    sourceIndex,
    indexInBeatmap,
    hitSound,
    hyperDash: false,
    distanceToHyperDash: 0,
  };
}

function convertCircle(circle: HitCircle, sourceIndex: number, indexInBeatmap: number, scale: number): CatchObject {
  return makeNested('fruit', circle.time, circle.x, scale, sourceIndex, indexInBeatmap, circle.hitSound);
}

// Slider → JuiceStream → head Fruit + Tick Droplets + Repeat/Tail Fruits + interpolated
// TinyDroplets. The nested X base is the head's EffectiveX (XOffset still 0 at generation
// time, so clamp(originalX, 0, 512)) plus the head-relative path X.
function convertSlider(beatmap: BeatmapData, slider: Slider, sourceIndex: number, indexInBeatmap: number, scale: number): CatchObject[] {
  const { baseBeatLength, svMultiplier } = getTimingAt(beatmap, slider.time);

  // Velocity / TickDistance — JuiceStream.ApplyDefaultsToSelf. scoringDistance is the
  // deliberate round-trip `Velocity * BeatLength` (NOT 100*SliderMultiplier) for stable parity.
  const adjustedBeatLength = precisionAdjustedBeatLength(baseBeatLength, svMultiplier);
  const velocity = (BASE_SCORING_DISTANCE * beatmap.sliderMultiplier) / adjustedBeatLength;
  const scoringDistance = velocity * baseBeatLength;
  // Pre-v8 .osu formats: SV doesn't scale tick count over the same distance (CatchBeatmapConverter).
  const tickDistanceMultiplier = beatmap.formatVersion < 8 ? 1 / svMultiplier : 1;
  const tickDistance = scoringDistance / beatmap.sliderTickRate * tickDistanceMultiplier;

  const spanCount = slider.slides;            // SpanCount = RepeatCount + 1
  const pathDistance = slider.length;          // Path.Distance = ExpectedDistance (.osu length)
  const spanDuration = pathDistance / velocity; // Duration / SpanCount

  const events = generateSliderEvents(slider.time, spanDuration, velocity, tickDistance, pathDistance, spanCount);

  const jsEffectiveX = Math.fround(clamp(slider.x, 0, CATCH_WIDTH));

  const out: CatchObject[] = [];
  let lastEvent: SliderEvent | null = null;
  for (const e of events) {
    if (lastEvent !== null) {
      // Int-truncate BOTH event times to measure the gap; the tiny's StartTime re-adds the
      // untruncated lastEvent.time, and the loop bound uses the truncated gap (as in lazer).
      const sinceLastTick = Math.trunc(e.time) - Math.trunc(lastEvent.time);
      if (sinceLastTick > 80) {
        let timeBetweenTiny = sinceLastTick;            // double (NOT float)
        while (timeBetweenTiny > 100) timeBetweenTiny /= 2;
        for (let t = timeBetweenTiny; t < sinceLastTick; t += timeBetweenTiny) {
          const progress = lastEvent.pathProgress + (t / sinceLastTick) * (e.pathProgress - lastEvent.pathProgress);
          out.push(makeNested('tinyDroplet', t + lastEvent.time, jsEffectiveX + pathRelativeXAt(slider, progress), scale, sourceIndex, indexInBeatmap, slider.hitSound));
        }
      }
    }
    lastEvent = e;

    if (e.type === 'tick') {
      out.push(makeNested('droplet', e.time, jsEffectiveX + pathRelativeXAt(slider, e.pathProgress), scale, sourceIndex, indexInBeatmap, slider.hitSound));
    } else if (e.type === 'head' || e.type === 'tail' || e.type === 'repeat') {
      out.push(makeNested('fruit', e.time, jsEffectiveX + pathRelativeXAt(slider, e.pathProgress), scale, sourceIndex, indexInBeatmap, slider.hitSound));
    }
    // legacyLastTick: no object (it only advanced lastEvent above).
  }
  return out;
}

// Spinner → BananaShower → evenly-time-spaced Bananas. Int-truncated loop bounds, a
// float spacing accumulator (its FP rounding can add/drop the final banana — reproduce with
// Math.fround on every float op). Bananas carry no base X (the position pass assigns a
// random xOffset).
function convertSpinner(spinner: Spinner, sourceIndex: number, indexInBeatmap: number, scale: number): CatchObject[] {
  const startTimeI = Math.trunc(spinner.time);    // (int)StartTime
  const endTimeI = Math.trunc(spinner.endTime);   // (int)EndTime
  let spacing = Math.fround(spinner.endTime - spinner.time); // (float)(EndTime - StartTime)
  while (spacing > 100) spacing = Math.fround(spacing / 2);
  if (spacing <= 0) return [];

  const out: CatchObject[] = [];
  let count = 0;
  for (let time = startTimeI; time <= endTimeI; time = Math.fround(time + spacing)) {
    out.push({
      type: 'banana',
      startTime: time,
      originalX: 0,
      xOffset: 0,
      effectiveX: 0,
      scale,
      sourceIndex,
      indexInBeatmap,
      hitSound: spinner.hitSound,
      bananaIndex: count,
      hyperDash: false,
      distanceToHyperDash: 0,
    });
    count++;
  }
  return out;
}

/**
 * Convert a parsed beatmap (native mode-2 or std→catch) into the flat palpable object list,
 * in generation order: top-level beatmap order, nested objects in the order the lazer
 * generators emit them. That order is load-bearing — `applyPositionOffsets` must walk it to
 * keep its RNG draws aligned with lazer. xOffset is 0 for every object here; run
 * `applyPositionOffsets` afterwards to fill positions and hyperdash flags. `modDiff.cs`
 * supplies the (mod-adjusted) circle size that fixes every object's scale.
 */
export function convertBeatmapToCatch(beatmap: BeatmapData, modDiff: ModDifficulty): CatchObject[] {
  const scale = calculateScaleFromCircleSize(modDiff.cs);
  const out: CatchObject[] = [];
  // IndexInBeatmap = the 0-based rank of the top-level converted object
  // (CatchBeatmapProcessor.PostProcess iterates `Beatmap.HitObjects.OfType<CatchHitObject>()`
  // and stamps the same index onto every nested child). Every circle/slider/spinner converts
  // to exactly one top-level object, so this dense counter == the lazer index.
  let indexInBeatmap = 0;
  for (let i = 0; i < beatmap.hitObjects.length; i++) {
    const obj = beatmap.hitObjects[i];
    if (!obj) continue;
    if (obj.type === 'circle') {
      out.push(convertCircle(obj, i, indexInBeatmap, scale));
      indexInBeatmap++;
    } else if (obj.type === 'slider') {
      for (const o of convertSlider(beatmap, obj, i, indexInBeatmap, scale)) out.push(o);
      indexInBeatmap++;
    } else if (obj.type === 'spinner') {
      for (const o of convertSpinner(obj, i, indexInBeatmap, scale)) out.push(o);
      indexInBeatmap++;
    }
  }
  return out;
}
