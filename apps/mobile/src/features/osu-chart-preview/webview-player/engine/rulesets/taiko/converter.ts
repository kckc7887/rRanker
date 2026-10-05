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
import type { TaikoHit, TaikoDrumRoll, TaikoSwell, TaikoHitObject } from './types';
import { sliderEdgeSample, sliderVelocityMultiplier } from '../../utils/sliderDuration';

/** 参考 ppy/osu TaikoBeatmapConverter；float 用 fround，int 转换向零截断。 */

const VELOCITY_MULTIPLIER = Math.fround(1.4);
const SWELL_HIT_MULTIPLIER = Math.fround(1.65);
const OSU_BASE_SCORING_DISTANCE = 100;

const HITSOUND_WHISTLE = 2;
const HITSOUND_FINISH = 4;
const HITSOUND_CLAP = 8;

export function classifyTaikoHit(hitSound: number): { isRim: boolean; isStrong: boolean } {
  return {
    isRim: (hitSound & (HITSOUND_WHISTLE | HITSOUND_CLAP)) !== 0,
    isStrong: (hitSound & HITSOUND_FINISH) !== 0,
  };
}

function difficultyRange(diff: number, min: number, mid: number, max: number): number {
  if (diff > 5) return mid + (max - mid) * (diff - 5) / 5;
  if (diff < 5) return mid - (mid - min) * (5 - diff) / 5;
  return mid;
}

function getTimingAt(beatmap: BeatmapData, time: number): { baseBeatLength: number; svMultiplier: number } {
  let baseBeatLength = 500;
  let svMultiplier = 1;
  for (const tp of beatmap.timingPoints) {
    if (tp.time > time) break;
    if (!tp.inherited) {
      baseBeatLength = tp.beatLength;
      svMultiplier = 1;
    } else {
      svMultiplier = sliderVelocityMultiplier(tp.beatLength);
    }
  }
  return { baseBeatLength, svMultiplier };
}

function convertCircle(circle: HitCircle, sourceIndex: number): TaikoHit {
  const { isRim, isStrong } = classifyTaikoHit(circle.hitSound);
  return {
    kind: 'hit',
    time: circle.time,
    isRim,
    isStrong,
    hitSound: circle.hitSound,
    sourceIndex,
    noteId: 0,
  };
}

function convertSpinner(
  spinner: Spinner,
  sourceIndex: number,
  effOd: number,
): TaikoSwell {
  const duration = spinner.endTime - spinner.time;
  const hitsPerSecond = difficultyRange(effOd, 3, 5, 7.5) * SWELL_HIT_MULTIPLIER;
  const requiredHits = Math.max(1, Math.trunc(duration / 1000 * hitsPerSecond));
  return {
    kind: 'swell',
    time: spinner.time,
    endTime: spinner.endTime,
    requiredHits,
    hitSound: spinner.hitSound,
    sourceIndex,
  };
}

function* convertSlider(
  beatmap: BeatmapData,
  slider: Slider,
  sourceIndex: number,
  effSM: number,
): Generator<TaikoHitObject> {
  const spans = slider.slides;
  let distance = slider.length;

  /** 保留两步 float 运算的顺序，不能合并。 */
  distance *= VELOCITY_MULTIPLIER;
  distance *= spans;

  const { baseBeatLength, svMultiplier } = getTimingAt(beatmap, slider.time);

  let beatLength = baseBeatLength / svMultiplier;

  const sliderScoringPointDistance = OSU_BASE_SCORING_DISTANCE
    * (effSM * VELOCITY_MULTIPLIER)
    / beatmap.sliderTickRate;
  const taikoVelocity = sliderScoringPointDistance * beatmap.sliderTickRate;
  const taikoDuration = Math.trunc(distance / taikoVelocity * beatLength);

  const isForCurrentRuleset = beatmap.mode === 1;

  if (isForCurrentRuleset) {
    yield makeDrumRoll(beatmap, slider, sourceIndex, taikoDuration);
    return;
  }

  const osuVelocity = taikoVelocity * (1000 / beatLength);

  /** v8 起 tickSpacing 使用原始节拍长度，之前使用变速后的长度。 */

  if (beatmap.formatVersion >= 8) {
    beatLength = baseBeatLength;
  }

  const tickSpacing = Math.min(beatLength / beatmap.sliderTickRate, taikoDuration / spans);

  const shouldSplit = tickSpacing > 0 && (distance / osuVelocity * 1000) < (2 * beatLength);

  if (shouldSplit) {
    const endLimit = slider.time + taikoDuration + tickSpacing / 8;
    let i = 0;
    const edgeCount = Math.max(slider.slides + 1, slider.edgeSounds.length);
    for (let t = slider.time; t <= endLimit; t += tickSpacing) {
      const hs = sliderEdgeSample(slider, i % edgeCount).hitSound;
      const { isRim, isStrong } = classifyTaikoHit(hs);
      yield {
        kind: 'hit',
        time: t,
        isRim,
        isStrong,
        hitSound: hs,
        sourceIndex,
        noteId: 0,
      };
      i++;
    }
    return;
  }

  yield makeDrumRoll(beatmap, slider, sourceIndex, taikoDuration);
}

function makeDrumRoll(
  beatmap: BeatmapData,
  slider: Slider,
  sourceIndex: number,
  durationMs: number,
): TaikoDrumRoll {

  const tickRate = beatmap.sliderTickRate === 3 ? 3 : 4;
  const { baseBeatLength } = getTimingAt(beatmap, slider.time);
  const tickInterval = baseBeatLength / tickRate;

  const startTime = slider.time;
  const endTime = startTime + durationMs;

  const tickCount = tickInterval > 0 ? Math.max(0, Math.ceil(durationMs / tickInterval + 0.5)) : 0;
  if (!Number.isSafeInteger(tickCount) || !Number.isFinite(endTime)) throw new Error('滚奏时间无效');

  const { isStrong } = classifyTaikoHit(slider.hitSound);
  return {
    kind: 'drumroll',
    time: startTime,
    endTime,
    isStrong,
    hitSound: slider.hitSound,
    tickCount,
    tickInterval,
    sourceIndex,
  };
}

export function convertBeatmapToTaiko(
  beatmap: BeatmapData,
): TaikoHitObject[] {
  /** 转换使用未加 Mod 的难度；HR/EZ 在转换后影响滚速和判定窗口。 */

  const effSM = beatmap.sliderMultiplier;
  const effOd = beatmap.overallDifficulty;
  const out: TaikoHitObject[] = [];
  for (let i = 0; i < beatmap.hitObjects.length; i++) {
    const obj = beatmap.hitObjects[i];
    if (!obj) continue;
    if (obj.type === 'circle') {
      out.push(convertCircle(obj, i));
    } else if (obj.type === 'slider') {
      for (const h of convertSlider(beatmap, obj, i, effSM)) out.push(h);
    } else if (obj.type === 'spinner') {
      out.push(convertSpinner(obj, i, effOd));
    }
  }

  out.sort((a, b) => a.time - b.time);

  for (let i = 0; i < out.length; i++) {
    const o = out[i]!;
    if (o.kind === 'hit') o.noteId = i;
  }
  return out;
}
