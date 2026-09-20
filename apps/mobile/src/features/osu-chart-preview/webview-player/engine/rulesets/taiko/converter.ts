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

/**
 * Port of osu.Game.Rulesets.Taiko.Beatmaps.TaikoBeatmapConverter: maps circles,
 * sliders and spinners to hits, drum rolls / note streams, and swells.
 * Float-precision quirks preserved: VELOCITY/SWELL multipliers via Math.fround,
 * (int) casts via Math.trunc.
 */

const VELOCITY_MULTIPLIER = Math.fround(1.4);
const SWELL_HIT_MULTIPLIER = Math.fround(1.65);
const OSU_BASE_SCORING_DISTANCE = 100;

const HITSOUND_WHISTLE = 2;
const HITSOUND_FINISH = 4;
const HITSOUND_CLAP = 8;

/**
 * Derive a note's colour and finisher status from its .osu hitSound bitmask:
 * whistle/clap → rim (kat), finish → strong, as in TaikoBeatmapConverter.
 */
export function classifyTaikoHit(hitSound: number): { isRim: boolean; isStrong: boolean } {
  return {
    isRim: (hitSound & (HITSOUND_WHISTLE | HITSOUND_CLAP)) !== 0,
    isStrong: (hitSound & HITSOUND_FINISH) !== 0,
  };
}

// Local copy (not difficultyRate) to keep OD in raw double — avoids that helper's Math.fround step.
function difficultyRange(diff: number, min: number, mid: number, max: number): number {
  if (diff > 5) return mid + (max - mid) * (diff - 5) / 5;
  if (diff < 5) return mid - (mid - min) * (5 - diff) / 5;
  return mid;
}

// Mirrors the shared sliderDuration helper so std and taiko agree on the active timing point.
function getTimingAt(beatmap: BeatmapData, time: number): { baseBeatLength: number; svMultiplier: number } {
  let baseBeatLength = 500;
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

function convertCircle(circle: HitCircle, sourceIndex: number): TaikoHit {
  const { isRim, isStrong } = classifyTaikoHit(circle.hitSound);
  return {
    kind: 'hit',
    time: circle.time,
    isRim,
    isStrong,
    hitSound: circle.hitSound,
    sourceIndex,
    noteId: 0, // assigned post-sort in convertBeatmapToTaiko
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

function convertSlider(
  beatmap: BeatmapData,
  slider: Slider,
  sourceIndex: number,
  effSM: number,
): TaikoHitObject[] {
  const spans = slider.slides;
  let distance = slider.length;

  // Source comment: "Do not combine the following two lines!" — float ordering.
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
    return [makeDrumRoll(beatmap, slider, sourceIndex, taikoDuration)];
  }

  const osuVelocity = taikoVelocity * (1000 / beatLength);

  // Format v8+ uses raw beatLength for tickSpacing; pre-v8 keeps the speed-adjusted
  // value (legacy quirk preserved by TaikoBeatmapConverter).
  if (beatmap.formatVersion >= 8) {
    beatLength = baseBeatLength;
  }

  const tickSpacing = Math.min(beatLength / beatmap.sliderTickRate, taikoDuration / spans);

  const shouldSplit = tickSpacing > 0 && (distance / osuVelocity * 1000) < (2 * beatLength);

  if (shouldSplit) {
    const hits: TaikoHit[] = [];
    const endLimit = slider.time + taikoDuration + tickSpacing / 8;
    let i = 0;
    const edgeSounds = slider.edgeSounds.length > 0 ? slider.edgeSounds : [slider.hitSound];
    for (let t = slider.time; t <= endLimit; t += tickSpacing) {
      const hs = edgeSounds[i % edgeSounds.length] ?? slider.hitSound;
      const { isRim, isStrong } = classifyTaikoHit(hs);
      hits.push({
        kind: 'hit',
        time: t,
        isRim,
        isStrong,
        hitSound: hs,
        sourceIndex,
        noteId: 0, // assigned post-sort in convertBeatmapToTaiko
      });
      i++;
    }
    return hits;
  }

  return [makeDrumRoll(beatmap, slider, sourceIndex, taikoDuration)];
}

function makeDrumRoll(
  beatmap: BeatmapData,
  slider: Slider,
  sourceIndex: number,
  durationMs: number,
): TaikoDrumRoll {
  // Lazer clamps tickRate: 3 if SliderTickRate==3, else 4. Uses BASE (un-SV-adjusted) beat length.
  const tickRate = beatmap.sliderTickRate === 3 ? 3 : 4;
  const { baseBeatLength } = getTimingAt(beatmap, slider.time);
  const tickInterval = baseBeatLength / tickRate;

  const startTime = slider.time;
  const endTime = startTime + durationMs;
  const tickTimes: number[] = [];
  if (tickInterval > 0) {
    // Mirrors DrumRoll.createTicks: inclusive of startTime; stop when next tick would overshoot endTime by >tickInterval/2.
    for (let t = startTime; t < endTime + tickInterval / 2; t += tickInterval) {
      tickTimes.push(t);
    }
  }

  const { isStrong } = classifyTaikoHit(slider.hitSound);
  return {
    kind: 'drumroll',
    time: startTime,
    endTime,
    isStrong,
    hitSound: slider.hitSound,
    tickTimes,
    tickInterval,
    sourceIndex,
  };
}

/**
 * Convert a beatmap's hit objects to taiko objects (TaikoBeatmapConverter port).
 * Handles both native taiko maps and std converts; output is time-sorted, with
 * each Hit assigned a unique `noteId`. Uses RAW (unmodded) difficulty — see below.
 */
export function convertBeatmapToTaiko(
  beatmap: BeatmapData,
): TaikoHitObject[] {
  // Conversion uses RAW (unmodded) SliderMultiplier and OD. In lazer, WorkingBeatmap.
  // GetPlayableBeatmap runs TaikoBeatmapConverter.Convert BEFORE any IApplicableToDifficulty
  // mod, so HR's SliderMultiplier (×1.4×4/3) and OD (×1.4) boosts — and EZ's halving — do NOT
  // change converted note times / counts / the drumroll-vs-stream split. Per TaikoModHardRock's
  // own doc, its SliderMultiplier factor is the *scrolling speed* (applied post-conversion via
  // taikoScrollMultiplier), not a rhythm change. Feeding HR's boosted SM in here would compress
  // every stream-converted slider's internal note spacing, desyncing it from the replay's
  // presses (≈ all-miss under HR on slider-heavy converts). Hit windows still use the modded
  // OD via modDiff.taikoHitWindow* in hitJudge — that's the correct post-conversion path.
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
  // Defensive: stream-converted sliders may overshoot the next source object's start time.
  out.sort((a, b) => a.time - b.time);
  // Assign each Hit a unique noteId (its post-sort index). sourceIndex is NOT unique for
  // stream-converted sliders, so per-note render state must key on noteId instead. See
  // hitJudgmentByNote in index.ts / Playfield.ts.
  for (let i = 0; i < out.length; i++) {
    const o = out[i]!;
    if (o.kind === 'hit') o.noteId = i;
  }
  return out;
}
