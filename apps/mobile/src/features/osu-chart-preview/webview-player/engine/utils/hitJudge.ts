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
import type { BeatmapData, ReplayData, ReplayFrame, HitResult, Slider, Spinner } from '../types/index';
import type { ModDifficulty } from './modDifficulty';
import { sampleSlider } from '../renderer/SliderGeometry';
import {
  sampleSliderLazer,
  sliderTickTimesLazer,
  sliderBallPosLazer,
} from '../renderer/SliderGeometryLazer';
import { slideDurationMs } from './sliderDuration';

const SPINNER_CENTER_X = 256;
const SPINNER_CENTER_Y = 192;

// osu!stable: any click whose |delta| ≥ 400 ms relative to a circle's start time
// is shaken regardless of notelock state (HittableRange in danser).
const HITTABLE_RANGE = 400;

// osu!stable: 2B tolerance when comparing previous-object endTime against next
// object's startTime (Tolerance2B = 3 ms).
const NOTELOCK_TOLERANCE = 3;

/**
 * Per-spinner rotation timeline, one entry per input sample, sorted by time
 * (beatmap ms). Produced by `computeHitResults`; sampled via `getSpinnerStateAt`.
 */
export interface SpinnerAngleData {
  times: number[];
  // cumAngles: signed visual rotation (sprite, rad). absAngles: reversal-immune total
  // rotation magnitude (lazer SpinHistory.TotalRotation, rad) for judgement/progress.
  cumAngles: number[];
  absAngles: number[];
  // Beatmap-times at which a spinner-bonus is awarded — drives the on-screen popup
  // and the spinnerbonus sample (once per bonus spin past the requirement+gap).
  bonusTimes: number[];
}

/**
 * Sample a spinner's rotation state at `timeMs` (beatmap ms) by binary search:
 * signed visual angle plus reversal-immune total angle, both in radians.
 */
export function getSpinnerStateAt(
  data: SpinnerAngleData,
  timeMs: number,
): { cumAngle: number; absAngle: number } {
  if (data.times.length === 0) return { cumAngle: 0, absAngle: 0 };
  if (timeMs <= data.times[0]!) return { cumAngle: 0, absAngle: 0 };
  let lo = 0, hi = data.times.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (data.times[mid]! <= timeMs) lo = mid; else hi = mid - 1;
  }
  return { cumAngle: data.cumAngles[lo]!, absAngle: data.absAngles[lo]! };
}

// Linear OD→rate with a knee at OD 5 (danser's DifficultyRate). The f32 round-
// trip on `od` matches danser/osu!stable byte-for-byte on boundary cases where
// a DA-mod OD is not exactly representable as f64.
function difficultyRate(od: number, minV: number, midV: number, maxV: number): number {
  const d = Math.fround(od);
  if (d > 5) return midV + (maxV - midV) * (d - 5) / 5;
  if (d < 5) return midV - (midV - minV) * (5 - d) / 5;
  return midV;
}

/**
 * Stable spinner requirement, counted in HALF-spins.
 * SpinnerRatio = DifficultyRate(od, 3, 5, 7.5) is half-spins/sec (not full
 * rotations), matching stable's scoringRotationCount. A requirement of 0 is the
 * fast path that hands out an instant 300 on degenerate/very-short spinners.
 */
export function stableSpinnerRequirementHalfSpins(od: number, durationMs: number): number {
  return Math.floor(durationMs / 1000 * difficultyRate(od, 3, 5, 7.5));
}

/**
 * Lazer spinner requirement, counted in FULL spins.
 * MinRPS = DifficultyRange(od, 90, 150, 225)/60 = 1.5/2.5/3.75 spins/s at
 * OD 0/5/10. The +1e-4 nudge guards against rates that land just under an
 * integer in f64.
 */
export function lazerSpinnerRequirementFullSpins(od: number, durationMs: number): number {
  return Math.floor(durationMs / 1000 * difficultyRate(od, 1.5, 2.5, 3.75) + 1e-4);
}

/**
 * Lazer Spinner.cs MaximumBonusSpins: floor(maxRps·secs + 1e-4) − SpinsRequired −
 * bonus_spins_gap(2), floored at 0. maxRps = DifficultyRange(OD, COMPLETE_RPM_RANGE
 * = 250/380/430)/60. Caps how many LargeBonus (1000-popup) ticks a spinner can yield.
 */
export function lazerSpinnerMaxBonusSpins(od: number, durationMs: number): number {
  const maxRps = difficultyRate(od, 250, 380, 430) / 60;
  const maxTotal = Math.floor(durationMs / 1000 * maxRps + 1e-4);
  return Math.max(0, maxTotal - lazerSpinnerRequirementFullSpins(od, durationMs) - 2);
}

// Beatmap-times at which a spinner-bonus is awarded (the on-screen popup increments and
// the spinnerbonus sample fires). Dispatched like the bonus scoring:
//   lazer  — one per completed full spin past SpinsRequired+gap(2), capped at MaximumBonusSpins.
//   stable — danser's per-half-spin SpinnerBonus parity: c > req+3 with (c-(req+3)) even.
// Walks the (already monotonic) absAngles timeline once, emitting the crossing time of each.
function spinnerBonusTickTimes(
  times: readonly number[],
  absAngles: readonly number[],
  od: number,
  durationMs: number,
  isLazer: boolean,
): number[] {
  const out: number[] = [];
  if (isLazer) {
    const req  = lazerSpinnerRequirementFullSpins(od, durationMs);
    const last = req + 2 + lazerSpinnerMaxBonusSpins(od, durationMs);
    let k = req + 3;   // first bonus spin (1-based completion count past the gap)
    for (let i = 0; i < absAngles.length && k <= last; i++) {
      const spins = Math.floor(absAngles[i]! / (2 * Math.PI));
      while (k <= spins && k <= last) { out.push(times[i]!); k++; }
    }
  } else {
    const req = stableSpinnerRequirementHalfSpins(od, durationMs);
    let c = 1;
    for (let i = 0; i < absAngles.length; i++) {
      const half = Math.floor(absAngles[i]! / Math.PI);
      while (c <= half) {
        if (c > req + 3 && (c - (req + 3)) % 2 === 0) out.push(times[i]!);
        c++;
      }
    }
  }
  return out;
}

/**
 * Spinner completion fraction (0..1) for `totalRad` of reversal-immune rotation.
 * Uses the same requirement thresholds as the final judgement so a progress
 * display flips exactly at the first-clear-tier instant.
 */
export function spinnerProgress(od: number, durationMs: number, totalRad: number, isLazer: boolean): number {
  if (isLazer) {
    const req = lazerSpinnerRequirementFullSpins(od, durationMs);
    if (req === 0) return 1;
    return Math.min(1, (totalRad / (2 * Math.PI)) / req);
  }
  const req = stableSpinnerRequirementHalfSpins(od, durationMs);
  if (req === 0) return 1;
  return Math.min(1, (totalRad / Math.PI) / req);
}

function judgeSpinner(od: number, durationMs: number, totalRad: number, isLazer: boolean): 300 | 100 | 50 | 0 {
  if (isLazer) {
    // Lazer UpdatePostFor: completion-based, with an instant-300 fast path.
    const req = lazerSpinnerRequirementFullSpins(od, durationMs);
    if (req === 0) return 300;
    const completion = (totalRad / (2 * Math.PI)) / req;
    if (completion >= 1.0)  return 300;
    if (completion >= 0.9)  return 100;
    if (completion >= 0.75) return 50;
    return 0;
  }
  // Stable UpdatePostFor (new scoring, post-2019-05-10). Thresholds are offset
  // by ±1 half-spin from `requirement` — the +1 for Great is what makes a
  // 1 s / OD 5 spinner need 3 full rotations, not 2.5.
  const req = stableSpinnerRequirementHalfSpins(od, durationMs);
  if (req === 0) return 300;
  const halfSpins = totalRad / Math.PI;
  if (halfSpins >= req + 1)             return 300;
  if (halfSpins >= req - 1)             return 100;
  if (halfSpins >= Math.floor(req / 4)) return 50;
  return 0;
}

const TAU = 2 * Math.PI;

// Port of osu!lazer's SpinnerSpinHistory: the reversal-immune rotation accumulator.
// TotalRotation = TAU·completedSpins + currentSpinMaxRotation, where each spin only
// credits its high-water mark — wobbling back and forth (or rapidly reversing to
// "cheese" extra spins) adds nothing until you spin past 0 again. Forward-only: we
// build the timeline once in chronological order, so the rewind branch is unneeded.
function makeSpinHistory() {
  let totalAccum = 0;              // signed running rotation (rad)
  let accumAtLastCompletion = 0;   // snapshot at the last full-spin completion
  let currentMax = 0;              // high-water |currentSpin| in this spin (0..TAU)
  let completedSpins = 0;
  return {
    report(delta: number) {
      totalAccum += delta;
      let currentSpin = totalAccum - accumAtLastCompletion;
      currentMax = Math.max(currentMax, Math.abs(currentSpin));
      while (currentMax >= TAU) {
        const dir = Math.sign(currentSpin) || 1;
        completedSpins++;
        accumAtLastCompletion += dir * TAU;
        currentSpin = totalAccum - accumAtLastCompletion;
        currentMax = Math.abs(currentSpin);
      }
    },
    total() { return TAU * completedSpins + currentMax; },
  };
}

// `cumAngles` is the signed visual rotation (drives the sprite); `absAngles` is the
// reversal-immune total rotation magnitude (SpinHistory.total) used for judgement,
// progress, and spin-bonus. The window is bracketed with samples interpolated exactly
// at spinner.time / spinner.endTime so we don't drop the partial spin at either end
// (lazer samples input continuously from StartTime; we only have sparse .osr frames).
function buildSpinnerAngles(
  spinner: Spinner,
  frames: ReplayFrame[],
  cumTimes: number[],
  od: number,
  isLazer: boolean,
  speed: number,
): SpinnerAngleData {
  const times: number[] = [];
  const cumAngles: number[] = [];
  const absAngles: number[] = [];

  const hist = makeSpinHistory();
  let prevAngle: number | null = null;
  let prevDelta = 0;   // last unwrapped delta — velocity proxy for direction-aware unwrap
  let cumAngle = 0;    // signed visual rotation

  const sample = (t: number, x: number, y: number) => {
    const dx = x - SPINNER_CENTER_X;
    const dy = y - SPINNER_CENTER_Y;
    // Min radius 5px: ignore atan2 noise near the spinner centre.
    if (dx * dx + dy * dy >= 25) {
      const angle = Math.atan2(dy, dx);
      if (prevAngle !== null) {
        // Direction-aware (velocity-continuity) unwrap: choose the 2π-multiple of the
        // raw delta nearest the previous delta, so a >180° gap from fast spinning is
        // continued in the spin direction instead of folded the short way (which the
        // old shortest-arc unwrap did, silently dropping rotation on short spinners).
        let d = angle - prevAngle;
        while (d - prevDelta >  Math.PI) d -= TAU;
        while (d - prevDelta < -Math.PI) d += TAU;
        prevDelta = d;   // raw resolved delta — continuity proxy for the next unwrap
        // Rate mods scale spinner rotation: danser spinner.go `delta *= GetSpeed()`.
        // The .osr frames sit on the map-time clock (cumTimes span the map-time
        // window), but the requirement is calibrated for that full map-time duration —
        // so a DT player's real-time spins must be scaled up by `speed` to match
        // (×1.5 DT/NC, ×0.75 HT). Without it, DT spinners under-count → spurious 100/50.
        const scaled = d * speed;
        cumAngle += scaled;
        hist.report(scaled);
      }
      prevAngle = angle;
    }
    times.push(t);
    cumAngles.push(cumAngle);
    absAngles.push(hist.total());
  };

  const start = cursorAt(frames, cumTimes, spinner.time);
  sample(spinner.time, start.x, start.y);

  for (let j = 0; j < frames.length; j++) {
    const t = cumTimes[j]!;
    if (t <= spinner.time)    continue;
    if (t >= spinner.endTime) break;
    const f = frames[j]!;
    sample(t, f.x, f.y);
  }

  const end = cursorAt(frames, cumTimes, spinner.endTime);
  sample(spinner.endTime, end.x, end.y);

  const bonusTimes = spinnerBonusTickTimes(
    times, absAngles, od, spinner.endTime - spinner.time, isLazer,
  );
  return { times, cumAngles, absAngles, bonusTimes };
}

function buildCumTimes(frames: ReplayFrame[]): number[] {
  const cumTimes = new Array<number>(frames.length);
  let acc = 0;
  for (let i = 0; i < frames.length; i++) {
    acc += frames[i]!.timeDelta;
    cumTimes[i] = acc;
  }
  return cumTimes;
}



interface KeyPress {
  timeMs: number;
  x: number;
  y: number;
}

// osu! tracks two independent buttons — Left (M1|K1) and Right (M2|K2) — each as a
// boolean; a press is the rising edge of EITHER. A K1/K2 keypress also raises its
// paired mouse bit, so a single tap shows up as two set bits in one column, not two
// presses. When BOTH columns rise in the same frame (a simultaneous double-tap),
// danser consumes leftCondE then rightCondE within one UpdateClickFor pass, so two
// objects resolve from that one frame (ruleset.go/circle.go). Emitting one press per
// frame would drop the second click and cascade an off-by-one through the stream.
const LEFT_BTN = 0b0101;   // M1 | K1
const RIGHT_BTN = 0b1010;  // M2 | K2
function buildKeyPresses(frames: ReplayFrame[], cumTimes: number[]): KeyPress[] {
  const presses: KeyPress[] = [];
  let prevKeys = 0;
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i]!;
    const curKeys = f.keys & 0b1111;
    const leftRise  = (prevKeys & LEFT_BTN)  === 0 && (curKeys & LEFT_BTN)  !== 0;
    const rightRise = (prevKeys & RIGHT_BTN) === 0 && (curKeys & RIGHT_BTN) !== 0;
    // Both presses share this frame's time + cursor position; emit left-before-right
    // to match danser's consumption order (only matters for which object each resolves).
    if (leftRise)  presses.push({ timeMs: cumTimes[i]!, x: f.x, y: f.y });
    if (rightRise) presses.push({ timeMs: cumTimes[i]!, x: f.x, y: f.y });
    prevKeys = curKeys;
  }
  return presses;
}

function cursorAt(
  frames: ReplayFrame[],
  cumTimes: number[],
  timeMs: number
): { x: number; y: number } {
  if (frames.length === 0) return { x: 0, y: 0 };
  const last = frames.length - 1;
  if (timeMs <= cumTimes[0]!)  return { x: frames[0]!.x,    y: frames[0]!.y };
  if (timeMs >= cumTimes[last]!) return { x: frames[last]!.x, y: frames[last]!.y };

  let lo = 0, hi = last - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (cumTimes[mid]! <= timeMs) lo = mid; else hi = mid - 1;
  }
  const t0 = cumTimes[lo]!, t1 = cumTimes[lo + 1]!;
  const frac = t1 > t0 ? (timeMs - t0) / (t1 - t0) : 0;
  const f0 = frames[lo]!, f1 = frames[lo + 1]!;
  return { x: f0.x + (f1.x - f0.x) * frac, y: f0.y + (f1.y - f0.y) * frac };
}

function anyKeyHeld(frames: ReplayFrame[], cumTimes: number[], timeMs: number): boolean {
  if (frames.length === 0) return false;
  const last = frames.length - 1;
  if (timeMs <= cumTimes[0]!) return (frames[0]!.keys & 0b1111) !== 0;
  if (timeMs >= cumTimes[last]!) return (frames[last]!.keys & 0b1111) !== 0;
  let lo = 0, hi = last;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (cumTimes[mid]! <= timeMs) lo = mid; else hi = mid - 1;
  }
  return (frames[lo]!.keys & 0b1111) !== 0;
}

function pointAtFraction(
  path: { x: number; y: number }[],
  t: number
): { x: number; y: number } {
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

function sliderBallPos(
  path: { x: number; y: number }[],
  timeMs: number,
  sliderStartTime: number,
  slideDur: number,
  slides: number
): { x: number; y: number } {
  const elapsed  = timeMs - sliderStartTime;
  const slideF   = Math.max(0, Math.min(slides, elapsed / slideDur));
  const slideIdx = Math.min(Math.floor(slideF), slides - 1);
  let   frac     = slideF - slideIdx;
  if (slideIdx % 2 === 1) frac = 1 - frac;
  return pointAtFraction(path, frac);
}

/**
 * Stable-style slider tick times (beatmap ms), spaced `beatLength / sliderTickRate`
 * within each slide, excluding a 1 ms guard before each slide end. Lazer replays
 * use the distance-based `sliderTickTimesLazer` instead.
 */
export function sliderTickTimes(beatmap: BeatmapData, slider: Slider, slideDur: number): number[] {
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
    const slideEnd   = slideStart + slideDur;
    for (let t = slideStart + tickInterval; t < slideEnd - 1; t += tickInterval) {
      ticks.push(t);
    }
  }
  return ticks;
}

// Sliders: notelock treats them resolved iff pressTime >= endTime (stable's slider.IsHit).
// Spinners: headResolved=true from start; notelock blocks subsequent clicks until endTime.
interface ObjState {
  type: 'circle' | 'slider' | 'spinner';
  startTime: number;
  endTime: number;
  x: number;
  y: number;
  headResolved: boolean;
  headHit: boolean;
  headPressTime: number;
  headJudgement: 300 | 100 | 50 | 0;
}

interface HitResultsOutput {
  results: HitResult[];
  spinnerAngles: Map<number, SpinnerAngleData>;
  /**
   * Time intervals (beatmap ms) during which the player is actively tracking a slider —
   * computed from the same hysteresis walk used for tick/repeat/tail judgement.
   * Used by the flashlight renderer to dim the lit area during slider tracking.
   * Sorted by `start`; intervals do not overlap (each slider closes before the next begins).
   */
  trackingIntervals: { start: number; end: number }[];
}

/**
 * Judge an osu!standard replay: re-simulates osu!'s per-press hit logic (press
 * consumption, notelock, slider tracking, spinner rotation) over the raw input
 * frames and returns one `HitResult` stream plus spinner timelines and slider
 * tracking intervals, all in beatmap ms. Stable vs lazer semantics are selected
 * from `modDiff` (isLazer + CL sub-flags).
 *
 * An on-circle press ≥ w50 from the start time (but within ±400 ms) resolves as
 * a Miss at press time, freeing notelock — matching stable.
 */
export function computeHitResults(beatmap: BeatmapData, replay: ReplayData, modDiff: ModDifficulty): HitResultsOutput {
  const od = modDiff.od;

  // Lazer rules: <= unrounded window, head/start notelock, PostHit chain-miss. CL reverts.
  const useLazerRules = modDiff.isLazer && !modDiff.lzLegacyNotelock;
  // Independent of useLazerRules — CL's two sub-flags can differ.
  const useLazerSliderScoring = modDiff.isLazer && !modDiff.lzNoSliderAcc;
  const w300 = useLazerRules ? modDiff.hitWindow300U : modDiff.hitWindow300;
  const w100 = useLazerRules ? modDiff.hitWindow100U : modDiff.hitWindow100;
  const w50  = useLazerRules ? modDiff.hitWindow50U  : modDiff.hitWindow50;
  const hitRadius = modDiff.circleRadiusPx;
  const hitRadiusSq = hitRadius * hitRadius;
  const fy = modDiff.isHR ? (y: number) => 384 - y : (y: number) => y;

  const cumTimes  = buildCumTimes(replay.frames);
  const keyPresses = buildKeyPresses(replay.frames, cumTimes);

  const spinnerAngles = new Map<number, SpinnerAngleData>();
  const states: ObjState[] = new Array(beatmap.hitObjects.length);

  for (let i = 0; i < beatmap.hitObjects.length; i++) {
    const obj = beatmap.hitObjects[i]!;
    if (obj.type === 'spinner') {
      spinnerAngles.set(i, buildSpinnerAngles(obj, replay.frames, cumTimes, modDiff.od, modDiff.isLazer, modDiff.speed));
      states[i] = {
        type: 'spinner',
        startTime: obj.time,
        endTime: obj.endTime,
        x: SPINNER_CENTER_X, y: SPINNER_CENTER_Y,
        headResolved: true,
        headHit: true,
        headPressTime: obj.endTime,
        headJudgement: 0,
      };
    } else if (obj.type === 'circle') {
      const stackShift = obj.stackHeight * hitRadius / 10;
      states[i] = {
        type: 'circle',
        startTime: obj.time,
        endTime: obj.time,
        x: obj.x - stackShift,
        y: fy(obj.y) - stackShift,
        headResolved: false,
        headHit: false,
        headPressTime: 0,
        headJudgement: 0,
      };
    } else {
      const stackShift = obj.stackHeight * hitRadius / 10;
      const slideDur = slideDurationMs(beatmap, obj);
      states[i] = {
        type: 'slider',
        startTime: obj.time,
        endTime: obj.time + slideDur * obj.slides,
        x: obj.x - stackShift,
        y: fy(obj.y) - stackShift,
        headResolved: false,
        headHit: false,
        headPressTime: 0,
        headJudgement: 0,
      };
    }
  }

  // walkStart: index of first potentially-clickable head; advanced by auto-miss expiry.
  let walkStart = 0;

  for (let pi = 0; pi < keyPresses.length; pi++) {
    const p = keyPresses[pi]!;

    // Stable's UpdatePostFor uses strict `time > startTime + Hit50`.
    while (walkStart < states.length) {
      const s = states[walkStart]!;
      if (s.type === 'spinner' || s.headResolved) { walkStart++; continue; }
      // Stable removes a slider at its endTime (UpdatePostFor → isHit), after which
      // the head can no longer be clicked (slider.go: clickable only while
      // !isHit). For a SHORT slider (duration < w50) endTime precedes
      // startTime+w50, so the head's hittable window is capped at endTime — a press
      // in (endTime, startTime+w50] must fall through to the next object, not hit
      // the head. Lazer keeps the head clickable past endTime (`|| lazer`).
      const expireAt = (s.type === 'slider' && !modDiff.isLazer)
        ? Math.min(s.startTime + w50, s.endTime)
        : s.startTime + w50;
      if (expireAt < p.timeMs) {
        s.headResolved = true;
        s.headHit = false;
        s.headJudgement = 0;
        s.headPressTime = expireAt;
        walkStart++;
        continue;
      }
      break; // current head still in its hit window
    }

    // Find first unresolved circle/slider-head the cursor is inside (in
    // chronological order). Stop when we pass objects too far in the future
    // for HittableRange to allow.
    let candIdx = -1;
    for (let j = walkStart; j < states.length; j++) {
      const s = states[j]!;
      if (s.startTime > p.timeMs + HITTABLE_RANGE) break;
      if (s.type === 'spinner' || s.headResolved) continue;
      const dx = p.x - s.x, dy = p.y - s.y;
      if (dx * dx + dy * dy > hitRadiusSq) continue;  // PositionalMiss path: don't consume
      candIdx = j;
      break;
    }

    if (candIdx < 0) continue;

    const X = states[candIdx]!;

    let blocked = false;
    if (useLazerRules) {
      // CanBeHitLazer: block iff previous head unhit AND p.timeMs < lastObj.startTime.
      // Past lastObj.startTime, next becomes clickable — permits streams through sliders.
      let lastObj: ObjState | null = null;
      for (let j = candIdx - 1; j >= 0; j--) {
        const Y = states[j]!;
        if (Y.type !== 'spinner') { lastObj = Y; break; }
      }
      if (lastObj !== null && !lastObj.headHit && p.timeMs < lastObj.startTime) {
        blocked = true;
      }
    } else {
      // CanBeHitStable: any earlier still-unresolved Y blocks if Y.endTime + 3 < X.startTime.
      for (let j = 0; j < candIdx; j++) {
        const Y = states[j]!;
        const yUnresolved = (Y.type === 'circle')
          ? !Y.headResolved
          : p.timeMs < Y.endTime;
        if (!yUnresolved) continue;
        if (Y.endTime + NOTELOCK_TOLERANCE < X.startTime) { blocked = true; break; }
      }
    }

    if (!blocked && Math.abs(p.timeMs - X.startTime) >= HITTABLE_RANGE) {
      blocked = true;
    }

    if (blocked) {
      // Shake: press consumed but head stays clickable for a later press / auto-miss.
      continue;
    }

    // Stable: int64(|delta|) < window. Lazer: |delta| <= unrounded window.
    const offset = Math.abs(p.timeMs - X.startTime);
    let judgement: 300 | 100 | 50 | 0;
    if (useLazerRules) {
      if      (offset <= w300) judgement = 300;
      else if (offset <= w100) judgement = 100;
      else if (offset <= w50)  judgement = 50;
      else                     judgement = 0;
    } else {
      if      (offset < w300) judgement = 300;
      else if (offset < w100) judgement = 100;
      else if (offset < w50)  judgement = 50;
      else                    judgement = 0;
    }

    X.headResolved   = true;
    X.headHit        = (judgement !== 0);
    X.headJudgement  = judgement;
    X.headPressTime  = p.timeMs;

    // Lazer PostHit: on a hit, force-miss every earlier unresolved circle/slider at press time.
    // Miss doesn't chain. Stable instead auto-misses them at startTime + w50.
    if (useLazerRules && judgement !== 0) {
      for (let j = walkStart; j < candIdx; j++) {
        const Y = states[j]!;
        if (Y.type === 'spinner' || Y.headResolved) continue;
        Y.headResolved   = true;
        Y.headHit        = false;
        Y.headJudgement  = 0;
        Y.headPressTime  = p.timeMs;
      }
    }
  }

  for (const s of states) {
    if (s.type === 'spinner' || s.headResolved) continue;
    s.headResolved = true;
    s.headHit = false;
    s.headJudgement = 0;
    s.headPressTime = s.startTime + w50;
  }

  const results: HitResult[] = [];
  const trackingIntervals: { start: number; end: number }[] = [];

  for (let i = 0; i < beatmap.hitObjects.length; i++) {
    const obj = beatmap.hitObjects[i]!;
    const s   = states[i]!;

    if (obj.type === 'spinner') {
      const duration = obj.endTime - obj.time;
      const angleData = spinnerAngles.get(i)!;
      const totalRad = angleData.absAngles.length > 0
        ? angleData.absAngles[angleData.absAngles.length - 1]!
        : 0;
      const judgement = judgeSpinner(od, duration, totalRad, modDiff.isLazer);

      results.push({
        objectIndex: i,
        judgement,
        time: obj.endTime,
        x: SPINNER_CENTER_X,
        y: SPINNER_CENTER_Y,
        hitSound: obj.hitSound,
        comboBreak: judgement === 0,
        spinnerTotalRad: totalRad,
        spinnerBonusTimes: angleData.bonusTimes,
      });
      continue;
    }

    if (obj.type === 'circle') {
      results.push({
        objectIndex: i,
        judgement: s.headJudgement,
        time: s.headPressTime,
        x: s.x, y: s.y,
        hitSound: obj.hitSound ?? 0,
        comboBreak: s.headJudgement === 0,
      });
      continue;
    }

    // Geometry is keyed on isLazer itself (not useLazerSliderScoring): CL uses
    // lazer sampling/ticks but scores them under stable-style rules.
    const slider     = obj;
    const slideDur   = slideDurationMs(beatmap, slider);
    const path       = modDiff.isLazer ? sampleSliderLazer(slider) : sampleSlider(slider);
    const followBase2 = hitRadius * hitRadius;
    const followExp2  = (2.4 * hitRadius) ** 2;
    const tailTime   = slider.time + slideDur * slider.slides;
    const totalDur   = slideDur * slider.slides;
    const tailLeniency = Math.min(36, totalDur / 2);
    const stackShift = slider.stackHeight * hitRadius / 10;

    const tickTimes = modDiff.isLazer
      ? sliderTickTimesLazer(beatmap, slider, slideDur)
      : sliderTickTimes(beatmap, slider, slideDur);

    type NTEvent = { t: number; kind: 'tick' | 'repeat' };
    const nonTail: NTEvent[] = [];
    for (const t of tickTimes) nonTail.push({ t, kind: 'tick' });
    for (let edge = 1; edge < slider.slides; edge++) {
      nonTail.push({ t: slider.time + slideDur * edge, kind: 'repeat' });
    }
    nonTail.sort((a, b) => a.t - b.t);

    const headHit = s.headHit;
    const totalNested = 1 + tickTimes.length + slider.slides;
    let   hitNested   = headHit ? 1 : 0;

    let tracking = false;
    let trackingStart: number | null = null;

    const ballStackedAt = (t: number): { x: number; y: number } => {
      const raw = modDiff.isLazer
        ? sliderBallPosLazer(path, t, slider.time, slideDur, slider.slides)
        : sliderBallPos(path, t, slider.time, slideDur, slider.slides);
      return { x: raw.x - stackShift, y: fy(raw.y) - stackShift };
    };
    const stepTracking = (t: number, cx: number, cy: number, keysHeld: boolean): void => {
      const wasTracking = tracking;
      if (!keysHeld) {
        tracking = false;
      } else {
        const b = ballStackedAt(t);
        const dx = cx - b.x, dy = cy - b.y;
        const d2 = dx * dx + dy * dy;
        tracking = tracking ? (d2 <= followExp2) : (d2 <= followBase2);
      }
      if (!wasTracking && tracking) {
        trackingStart = t;
      } else if (wasTracking && !tracking && trackingStart !== null) {
        trackingIntervals.push({ start: trackingStart, end: t });
        trackingStart = null;
      }
    };

    let frameIdx = 0;
    while (frameIdx < replay.frames.length && cumTimes[frameIdx]! < slider.time) frameIdx++;

    for (const ev of nonTail) {
      while (frameIdx < replay.frames.length && cumTimes[frameIdx]! < ev.t) {
        const f = replay.frames[frameIdx]!;
        stepTracking(cumTimes[frameIdx]!, f.x, f.y, (f.keys & 0b1111) !== 0);
        frameIdx++;
      }
      const cur = cursorAt(replay.frames, cumTimes, ev.t);
      const kh  = anyKeyHeld(replay.frames, cumTimes, ev.t);
      stepTracking(ev.t, cur.x, cur.y, kh);

      const hit = tracking;
      if (hit) hitNested++;
      const b = ballStackedAt(ev.t);
      results.push({
        objectIndex: i, judgement: hit ? 300 : 0,
        time: ev.t, x: b.x, y: b.y,
        hitSound: 0, comboBreak: !hit && headHit, isSliderSub: true,
      });
    }

    const tailStart = nonTail.length > 0
      ? Math.max(tailTime - tailLeniency, nonTail[nonTail.length - 1]!.t)
      : tailTime - tailLeniency;

    while (frameIdx < replay.frames.length && cumTimes[frameIdx]! < tailStart) {
      const f = replay.frames[frameIdx]!;
      stepTracking(cumTimes[frameIdx]!, f.x, f.y, (f.keys & 0b1111) !== 0);
      frameIdx++;
    }
    {
      const cur = cursorAt(replay.frames, cumTimes, tailStart);
      const kh  = anyKeyHeld(replay.frames, cumTimes, tailStart);
      stepTracking(tailStart, cur.x, cur.y, kh);
    }

    // Stable judges the slider end exactly once at the first frame ≥ tailStart;
    // there is no rescue look-ahead. The synth check above (at tailStart) is
    // our equivalent — anything after that would diverge from stable and count
    // sliders as 300 that stable scores 100 (or miss, if the head was missed).
    const tailHit = tracking;
    if (tailHit) hitNested++;

    // Close any open tracking interval at tailTime so flashlight dim ends with
    // the slider. If tracking went false earlier, stepTracking already pushed
    // the interval — nothing to do here.
    if (trackingStart !== null) {
      trackingIntervals.push({ start: trackingStart, end: tailTime });
      trackingStart = null;
    }
    const tb = ballStackedAt(tailStart);
    results.push({
      objectIndex: i, judgement: tailHit ? 300 : 0,
      time: tailTime, x: tb.x, y: tb.y,
      hitSound: 0, comboBreak: false,
      isSliderSub: true,
      // Default lazer: the tail is a SliderTail (acc-affecting, max 150).
      // CL / stable: tail has no acc contribution — accMax stays undefined and
      // isSliderSub alone keeps it out of the accuracy denominator.
      ...(useLazerSliderScoring ? { accMax: 150 as const } : {}),
    });

    // Under default lazer, the head is its own full 300/100/50/miss judgement
    // and it's what lands in scoreInfo.statistics.great/ok/meh/miss.
    // Under stable / CL, we keep the fraction-based combine (the classic
    // hitNested/totalNested threshold).
    let sliderJudgement: 300 | 100 | 50 | 0;
    if (useLazerSliderScoring) {
      sliderJudgement = s.headJudgement;
    } else if (hitNested === totalNested)       sliderJudgement = 300;
    else if (hitNested === 0)                   sliderJudgement = 0;
    else if (hitNested / totalNested >= 0.5)    sliderJudgement = 100;
    else                                        sliderJudgement = 50;

    // Main popup at ball's final resting position: even slides→head, odd→tail (matches stable).
    const finalBall = ballStackedAt(tailTime);
    results.push({
      objectIndex: i,
      judgement: sliderJudgement,
      time: s.headPressTime,
      displayTime: tailTime,
      x: finalBall.x, y: finalBall.y,
      hitSound: slider.hitSound ?? 0,
      comboBreak: !headHit,
    });
  }

  return { results, spinnerAngles, trackingIntervals };
}
