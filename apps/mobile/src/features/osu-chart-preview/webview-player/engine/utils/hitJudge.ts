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
import type { BeatmapData, ReplayData, ReplayFrame, HitResult, Spinner } from '../types/index';
import type { ModDifficulty } from './modDifficulty';
import { sampleSlider } from '../renderer/SliderGeometry';
import {
  sampleSliderLazer,
  sliderBallPosLazer,
} from '../renderer/SliderGeometryLazer';
import { slideDurationMs, sliderNestedEvents } from './sliderDuration';

const SPINNER_CENTER_X = 256;
const SPINNER_CENTER_Y = 192;

/** stable 对距起始时间至少 400ms 的点击播放 shake。 */

const HITTABLE_RANGE = 400;

/** stable 的相邻物件结束/开始比较允许 3ms 容差。 */

const NOTELOCK_TOLERANCE = 3;

export interface SpinnerAngleData {
  times: number[];
  /** cumAngles 是视觉旋转，absAngles 是不因反向摆动重复增加的判定旋转，单位 rad。 */

  cumAngles: number[];
  absAngles: number[];

  bonusTimes: number[];
}

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

function difficultyRate(od: number, minV: number, midV: number, maxV: number): number {
  const d = Math.fround(od);
  if (d > 5) return midV + (maxV - midV) * (d - 5) / 5;
  if (d < 5) return midV - (midV - minV) * (5 - d) / 5;
  return midV;
}

/** stable 转盘要求用半圈计数，lazer 用整圈。 */
export function stableSpinnerRequirementHalfSpins(od: number, durationMs: number): number {
  return Math.floor(durationMs / 1000 * difficultyRate(od, 3, 5, 7.5));
}

export function lazerSpinnerRequirementFullSpins(od: number, durationMs: number): number {
  return Math.floor(durationMs / 1000 * difficultyRate(od, 1.5, 2.5, 3.75) + 1e-4);
}

export function lazerSpinnerMaxBonusSpins(od: number, durationMs: number): number {
  const maxRps = difficultyRate(od, 250, 380, 430) / 60;
  const maxTotal = Math.floor(durationMs / 1000 * maxRps + 1e-4);
  return Math.max(0, maxTotal - lazerSpinnerRequirementFullSpins(od, durationMs) - 2);
}

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
    let k = req + 3;
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

    const req = lazerSpinnerRequirementFullSpins(od, durationMs);
    if (req === 0) return 300;
    const completion = (totalRad / (2 * Math.PI)) / req;
    if (completion >= 1.0)  return 300;
    if (completion >= 0.9)  return 100;
    if (completion >= 0.75) return 50;
    return 0;
  }

  const req = stableSpinnerRequirementHalfSpins(od, durationMs);
  if (req === 0) return 300;
  const halfSpins = totalRad / Math.PI;
  if (halfSpins >= req + 1)             return 300;
  if (halfSpins >= req - 1)             return 100;
  if (halfSpins >= Math.floor(req / 4)) return 50;
  return 0;
}

const TAU = 2 * Math.PI;

/** 每圈只累计最大转角，反向摆动不能重复加转数。 */

function makeSpinHistory() {
  let totalAccum = 0;
  let accumAtLastCompletion = 0;
  let currentMax = 0;
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
  let prevDelta = 0;
  let cumAngle = 0;

  const sample = (t: number, x: number, y: number) => {
    const dx = x - SPINNER_CENTER_X;
    const dy = y - SPINNER_CENTER_Y;

    if (dx * dx + dy * dy >= 25) {
      const angle = Math.atan2(dy, dx);
      if (prevAngle !== null) {
        /** 选择接近前次角速度的 2π 分支，保留超过半圈的快转采样。 */

        let d = angle - prevAngle;
        while (d - prevDelta >  Math.PI) d -= TAU;
        while (d - prevDelta < -Math.PI) d += TAU;
        prevDelta = d;
        /** DT/HT 将真实旋转乘播放速率，匹配谱面时间内的要求。 */

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

/** M1/K1 和 M2/K2 分别合并成左右键沿；同帧左右沿可各消耗一个音符。 */

const LEFT_BTN = 0b0101;
const RIGHT_BTN = 0b1010;
function buildKeyPresses(frames: ReplayFrame[], cumTimes: number[]): KeyPress[] {
  const presses: KeyPress[] = [];
  let prevKeys = 0;
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i]!;
    const curKeys = f.keys & 0b1111;
    const leftRise  = (prevKeys & LEFT_BTN)  === 0 && (curKeys & LEFT_BTN)  !== 0;
    const rightRise = (prevKeys & RIGHT_BTN) === 0 && (curKeys & RIGHT_BTN) !== 0;

    if (leftRise)  presses.push({ timeMs: cumTimes[i]!, x: f.x, y: f.y });
    if (rightRise) presses.push({ timeMs: cumTimes[i]!, x: f.x, y: f.y });
    prevKeys = curKeys;
  }
  return presses;
}

function buildPressSuffixMin(presses: KeyPress[]): number[] {
  const suffixMin = new Array<number>(presses.length + 1);
  suffixMin[presses.length] = Infinity;
  for (let pi = presses.length - 1; pi >= 0; pi--) {
    suffixMin[pi] = Math.min(presses[pi]!.timeMs, suffixMin[pi + 1]!);
  }
  return suffixMin;
}

function advanceBlockStart(states: ObjState[], start: number, minFuturePress: number): number {
  let index = start;
  while (index < states.length) {
    const Y = states[index]!;
    if (!(Y.type === 'circle' ? Y.headResolved : minFuturePress >= Y.endTime)) break;
    index++;
  }
  return index;
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

/** stable 的 slider 在结束前仍参与 notelock，spinner 从开始阻塞到结束。 */

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

  trackingIntervals: { start: number; end: number }[];
}

export function computeHitResults(beatmap: BeatmapData, replay: ReplayData, modDiff: ModDifficulty): HitResultsOutput {
  const od = modDiff.od;

  const useLazerRules = modDiff.isLazer && !modDiff.lzLegacyNotelock;

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

  let walkStart = 0;

  let blockStart = 0;
  const pressSuffixMin = buildPressSuffixMin(keyPresses);

  for (let pi = 0; pi < keyPresses.length; pi++) {
    const p = keyPresses[pi]!;

    while (walkStart < states.length) {
      const s = states[walkStart]!;
      if (s.type === 'spinner' || s.headResolved) { walkStart++; continue; }
      /** stable 短 slider 的 head 判定在 EndTime 截止；lazer 仍允许之后点击。 */

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
      break;
    }

    let candIdx = -1;
    for (let j = walkStart; j < states.length; j++) {
      const s = states[j]!;
      if (s.startTime > p.timeMs + HITTABLE_RANGE) break;
      if (s.type === 'spinner' || s.headResolved) continue;
      const dx = p.x - s.x, dy = p.y - s.y;
      if (dx * dx + dy * dy > hitRadiusSq) continue;
      candIdx = j;
      break;
    }

    if (candIdx < 0) continue;

    const X = states[candIdx]!;

    let blocked = false;
    if (useLazerRules) {

      let lastObj: ObjState | null = null;
      for (let j = candIdx - 1; j >= 0; j--) {
        const Y = states[j]!;
        if (Y.type !== 'spinner') { lastObj = Y; break; }
      }
      if (lastObj !== null && !lastObj.headHit && p.timeMs < lastObj.startTime) {
        blocked = true;
      }
    } else {

      blockStart = advanceBlockStart(states, blockStart, pressSuffixMin[pi]!);
      for (let j = blockStart; j < candIdx; j++) {
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

      continue;
    }

    /** stable 比较 int(|delta|)<window，lazer 比较 |delta|≤未取整窗口。 */
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

    /** lazer 成功判定会强制 miss 前方未判定 head；Miss 不连锁。 */

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
  let sliderFrameStart = 0;
  let previousSliderTime = -Infinity;

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

    /** CL 沿用 lazer 几何采样，但采用 stable 风格 slider 计分。 */

    const slider     = obj;
    const slideDur   = slideDurationMs(beatmap, slider);
    const path       = modDiff.isLazer ? sampleSliderLazer(slider) : sampleSlider(slider);
    const followBase2 = hitRadius * hitRadius;
    const followExp2  = (2.4 * hitRadius) ** 2;
    const tailTime   = slider.time + slideDur * slider.slides;
    const totalDur   = slideDur * slider.slides;
    const tailLeniency = Math.min(36, totalDur / 2);
    const stackShift = slider.stackHeight * hitRadius / 10;

    const headHit = s.headHit;
    let totalNested = 2;
    let lastNonTailTime = -Infinity;
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

    let frameIdx = slider.time >= previousSliderTime ? sliderFrameStart : 0;
    while (frameIdx < replay.frames.length && cumTimes[frameIdx]! < slider.time) frameIdx++;
    sliderFrameStart = frameIdx;
    previousSliderTime = slider.time;

    for (const ev of sliderNestedEvents(beatmap, slider, slideDur, modDiff.isLazer)) {
      if (ev.kind === 'tail') break;
      totalNested++;
      lastNonTailTime = ev.t;
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

    const tailStart = Math.max(tailTime - tailLeniency, lastNonTailTime);

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

    const tailHit = tracking;
    if (tailHit) hitNested++;

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
      /** 默认 lazer tail 计准确率，stable/CL tail 不计。 */

      ...(useLazerSliderScoring ? { accMax: 150 as const } : {}),
    });

    let sliderJudgement: 300 | 100 | 50 | 0;
    if (useLazerSliderScoring) {
      sliderJudgement = s.headJudgement;
    } else if (hitNested === totalNested)       sliderJudgement = 300;
    else if (hitNested === 0)                   sliderJudgement = 0;
    else if (hitNested / totalNested >= 0.5)    sliderJudgement = 100;
    else                                        sliderJudgement = 50;

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
