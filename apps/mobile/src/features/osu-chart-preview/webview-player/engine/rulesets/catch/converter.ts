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
import { sliderVelocityMultiplier } from '../../utils/sliderDuration';

/** 参考 ppy/osu CatchBeatmapConverter；float 运算用 fround，int 转换向零截断。 */

const BASE_SCORING_DISTANCE = 100;
const CATCH_WIDTH = 512;
const TAIL_LENIENCY = -36;
const MAX_LENGTH = 100000;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** catch 缩放不含 std 的 1.00041 系数。 */
export function calculateScaleFromCircleSize(cs: number): number {
  return Math.fround((1.0 - 0.7 * (cs - 5) / 5) / 2);
}

const CATCHER_BASE_SIZE = 106.75;
const ALLOWED_CATCH_RANGE = 0.8;

export function calculateCatchWidth(cs: number): number {
  const scaleX = Math.abs(calculateScaleFromCircleSize(cs) * 2);
  return Math.fround(CATCHER_BASE_SIZE * scaleX * ALLOWED_CATCH_RANGE);
}

/** 首个 BPM 点之前沿用该点节拍长度，SV 仍为 1。 */

function getTimingAt(beatmap: BeatmapData, time: number): { baseBeatLength: number; svMultiplier: number; generateTicks: boolean } {
  const firstUninherited = beatmap.timingPoints.find((tp) => !tp.inherited);
  let baseBeatLength = firstUninherited ? firstUninherited.beatLength : 500;
  let svMultiplier = 1;
  let generateTicks = true;
  for (const tp of beatmap.timingPoints) {
    if (tp.time > time) break;
    if (!tp.inherited) {
      baseBeatLength = tp.beatLength;
      svMultiplier = 1;
    } else {
      svMultiplier = sliderVelocityMultiplier(tp.beatLength);
    }
    generateTicks = !Number.isNaN(tp.beatLength);
  }
  return { baseBeatLength, svMultiplier, generateTicks };
}

/** catch/std 的 BPM 倍数限制为 10..1000，taiko/mania 为 10..10000。 */

function precisionAdjustedBeatLength(baseBeatLength: number, svMultiplier: number): number {
  const sliderVelocityAsBeatLength = -100 / svMultiplier;
  const bpmMultiplier = sliderVelocityAsBeatLength < 0
    ? clamp(Math.fround(-sliderVelocityAsBeatLength), 10, 1000) / 100.0
    : 1;
  return baseBeatLength * bpmMultiplier;
}

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

/** LegacyLastTick 不生成物件，但仍作为最后一段 tiny 的起点。 */
function* generateSliderEvents(
  startTime: number,
  spanDuration: number,
  velocity: number,
  tickDistance: number,
  totalDistance: number,
  spanCount: number,
): Generator<SliderEvent> {
  const length = Math.min(MAX_LENGTH, totalDistance);
  const td = clamp(tickDistance, 0, length);
  const minDistanceFromEnd = velocity * 10;

  yield { type: 'head', time: startTime, pathProgress: 0 };

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
    yield* ticks;

    if (span < spanCount - 1) {
      yield { type: 'repeat', time: spanStartTime + spanDuration, pathProgress: (span + 1) % 2 };
    }
  }

  const totalDuration = spanCount * spanDuration;
  const finalSpanStartTime = startTime + (spanCount - 1) * spanDuration;
  const legacyLastTickTime = Math.max(startTime + totalDuration / 2, (finalSpanStartTime + spanDuration) + TAIL_LENIENCY);
  let legacyLastTickProgress = (legacyLastTickTime - finalSpanStartTime) / spanDuration;
  if (spanCount % 2 === 0) legacyLastTickProgress = 1 - legacyLastTickProgress;
  yield { type: 'legacyLastTick', time: legacyLastTickTime, pathProgress: legacyLastTickProgress };

  yield { type: 'tail', time: startTime + totalDuration, pathProgress: spanCount % 2 };
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

function* convertSlider(beatmap: BeatmapData, slider: Slider, sourceIndex: number, indexInBeatmap: number, scale: number): Generator<CatchObject> {
  const { baseBeatLength, svMultiplier, generateTicks } = getTimingAt(beatmap, slider.time);

  const adjustedBeatLength = precisionAdjustedBeatLength(baseBeatLength, svMultiplier);
  const velocity = (BASE_SCORING_DISTANCE * beatmap.sliderMultiplier) / adjustedBeatLength;
  const scoringDistance = velocity * baseBeatLength;
  /** v8 前谱面的 SV 不改变同距离内 tick 数。 */
  const tickDistanceMultiplier = beatmap.formatVersion < 8 ? 1 / svMultiplier : 1;
  const tickDistance = generateTicks ? scoringDistance / beatmap.sliderTickRate * tickDistanceMultiplier : 0;

  const spanCount = slider.slides;
  const pathDistance = slider.length;
  const spanDuration = pathDistance / velocity;

  const events = generateSliderEvents(slider.time, spanDuration, velocity, tickDistance, pathDistance, spanCount);

  const jsEffectiveX = Math.fround(clamp(slider.x, 0, CATCH_WIDTH));

  let lastEvent: SliderEvent | null = null;
  for (const e of events) {
    if (lastEvent !== null) {
      /** 两端时间分别取整计算间隔，tiny 起点仍使用未取整时间。 */

      const sinceLastTick = Math.trunc(e.time) - Math.trunc(lastEvent.time);
      if (sinceLastTick > 80) {
        let timeBetweenTiny = sinceLastTick;
        while (timeBetweenTiny > 100) timeBetweenTiny /= 2;
        for (let t = timeBetweenTiny; t < sinceLastTick; t += timeBetweenTiny) {
          const progress = lastEvent.pathProgress + (t / sinceLastTick) * (e.pathProgress - lastEvent.pathProgress);
          yield makeNested('tinyDroplet', t + lastEvent.time, jsEffectiveX + pathRelativeXAt(slider, progress), scale, sourceIndex, indexInBeatmap, slider.hitSound);
        }
      }
    }
    lastEvent = e;

    if (e.type === 'tick') {
      yield makeNested('droplet', e.time, jsEffectiveX + pathRelativeXAt(slider, e.pathProgress), scale, sourceIndex, indexInBeatmap, slider.hitSound);
    } else if (e.type === 'head' || e.type === 'tail' || e.type === 'repeat') {
      yield makeNested('fruit', e.time, jsEffectiveX + pathRelativeXAt(slider, e.pathProgress), scale, sourceIndex, indexInBeatmap, slider.hitSound);
    }

  }
}

/** 香蕉间距累加用 float32，循环边界向零截断。 */

function* convertSpinner(spinner: Spinner, sourceIndex: number, indexInBeatmap: number, scale: number): Generator<CatchObject> {
  const startTimeI = Math.trunc(spinner.time);
  const endTimeI = Math.trunc(spinner.endTime);
  let spacing = Math.fround(spinner.endTime - spinner.time);
  while (spacing > 100) spacing = Math.fround(spacing / 2);
  if (spacing <= 0) return;

  let count = 0;
  let time = startTimeI;
  let useDouble = false;
  while (time <= endTimeI) {
    yield {
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
    };
    count++;
    /** float32 步长无法推进时间时，改用 double 避免停滞。 */

    const next = Math.fround(time + spacing);
    if (next <= time) useDouble = true;
    time = useDouble ? time + spacing : next;
  }
}

/** 按生成顺序转换物件，后续位置计算依赖相同随机抽样顺序。 */
export function convertBeatmapToCatch(beatmap: BeatmapData, modDiff: ModDifficulty): CatchObject[] {
  const scale = calculateScaleFromCircleSize(modDiff.cs);
  const out: CatchObject[] = [];

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
