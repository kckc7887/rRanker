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
import type { BeatmapData, HitCircle, Slider, Spinner } from '../../types/index';
import type { ModDifficulty } from '../../utils/modDifficulty';
import type { AutoFrame } from '../../utils/autoReplay';
import { sampleSlider } from '../../renderer/SliderGeometry';
import { slideDurationMs } from '../../utils/sliderDuration';

/** 参考 ppy/osu OsuAutoGenerator；光标按堆叠后的 osu!px 坐标移动。 */

type Point = { x: number; y: number };

const FRAME_STEP = 1000 / 60;
const REACTION_TIME = 100;
const KEY_UP_DELAY = 50;
const MIN_FRAME_SEP_ALTERNATING = 266;
const SPIN_RADIUS = 50;
const SPIN_RATE = 0.05;
const SPINNER_CENTER_X = 256;
const SPINNER_CENTER_Y = 192;

const LEFT = 0b0101;
const RIGHT = 0b1010;

function easeOut(t: number): number { return t * (2 - t); }
function easeIn(t: number): number { return t * t; }

type AutoCursor = { last: AutoFrame };
function lastFrame(cursor: AutoCursor): AutoFrame { return cursor.last; }
function emit(cursor: AutoCursor, frame: AutoFrame): AutoFrame { cursor.last = frame; return frame; }

function sliderBallPos(
  path: Point[], timeMs: number, startTime: number, slideDur: number, slides: number,
): Point {
  const slideF   = Math.max(0, Math.min(slides, (timeMs - startTime) / slideDur));
  const slideIdx = Math.min(Math.floor(slideF), slides - 1);
  let   frac     = slideF - slideIdx;
  if (slideIdx % 2 === 1) frac = 1 - frac;
  const idx = frac * (path.length - 1);
  const lo  = Math.floor(idx);
  const hi  = Math.min(lo + 1, path.length - 1);
  const f   = idx - lo;
  return {
    x: path[lo]!.x + (path[hi]!.x - path[lo]!.x) * f,
    y: path[lo]!.y + (path[hi]!.y - path[lo]!.y) * f,
  };
}

function* moveToObject(
  frames: AutoCursor, targetX: number, targetY: number,
  startTime: number, preemptMs: number, useIn: boolean, releaseTime: number,
): Generator<AutoFrame> {
  const lf = lastFrame(frames);
  const { x: startX, y: startY } = lf;
  let holdKeys = lf.keys;

  const waitTime = startTime - Math.max(0, preemptMs - REACTION_TIME);
  let fromTime = lf.time;
  if (waitTime > lf.time) {

    if (holdKeys !== 0 && releaseTime <= waitTime) {
      yield emit(frames, { time: releaseTime, x: startX, y: startY, keys: 0 });
      holdKeys = 0;
    }
    yield emit(frames, { time: waitTime, x: startX, y: startY, keys: holdKeys });
    fromTime = waitTime;
  }

  const dur = startTime - fromTime;
  if (dur <= 0) return;
  const ease = useIn ? easeIn : easeOut;
  for (let t = fromTime + FRAME_STEP; t < startTime; t += FRAME_STEP) {
    if (holdKeys !== 0 && t >= releaseTime) holdKeys = 0;
    const e = ease((t - fromTime) / dur);
    yield emit(frames, {
      time: Math.trunc(t),
      x: startX + (targetX - startX) * e,
      y: startY + (targetY - startY) * e,
      keys: holdKeys,
    });
  }
}

function* followSlider(
  frames: AutoCursor, beatmap: BeatmapData, slider: Slider, bits: number, radius: number,
  fy: (y: number) => number,
): Generator<AutoFrame, number> {
  const path     = sampleSlider(slider);
  const slideDur = slideDurationMs(beatmap, slider);
  const endTime  = slider.time + slideDur * slider.slides;
  const shift    = slider.stackHeight * radius / 10;

  for (let t = slider.time + FRAME_STEP; t < endTime; t += FRAME_STEP) {
    const p = sliderBallPos(path, t, slider.time, slideDur, slider.slides);
    yield emit(frames, { time: Math.trunc(t), x: p.x - shift, y: fy(p.y) - shift, keys: bits });
  }
  const pEnd = sliderBallPos(path, endTime, slider.time, slideDur, slider.slides);
  yield emit(frames, { time: endTime, x: pEnd.x - shift, y: fy(pEnd.y) - shift, keys: bits });
  return endTime + KEY_UP_DELAY;
}

function* spinSpinner(frames: AutoCursor, spinner: Spinner, bits: number, startAngle: number): Generator<AutoFrame, number> {
  let angle = startAngle;
  let prevT = spinner.time;
  const at = (a: number): Point => ({
    x: SPINNER_CENTER_X + Math.cos(a) * SPIN_RADIUS,
    y: SPINNER_CENTER_Y + Math.sin(a) * SPIN_RADIUS,
  });

  for (let t = spinner.time + FRAME_STEP; t < spinner.endTime; t += FRAME_STEP) {
    angle += (t - prevT) * SPIN_RATE;
    prevT = t;
    const p = at(angle);
    yield emit(frames, { time: Math.trunc(t), x: p.x, y: p.y, keys: bits });
  }
  angle += (spinner.endTime - prevT) * SPIN_RATE;
  const pEnd = at(angle);
  yield emit(frames, { time: spinner.endTime, x: pEnd.x, y: pEnd.y, keys: bits });
  return spinner.endTime + KEY_UP_DELAY + 1;
}

export function* generateStdAutoReplay(beatmap: BeatmapData, modDiff: ModDifficulty): Generator<AutoFrame> {
  const objs = beatmap.hitObjects;
  if (objs.length === 0) return;

  const radius = modDiff.circleRadiusPx;
  /** HR 先翻转 y，再扣除原始坐标的 stacking 偏移。 */

  const fy = modDiff.isHR ? (y: number) => 384 - y : (y: number) => y;

  const frames: AutoCursor = { last: { time: objs[0]!.time - 1500, x: 256, y: 500, keys: 0 } };
  yield frames.last;

  let buttonIndex = 0;
  let prevStartTime = -Infinity;

  let releaseTime = -Infinity;

  for (let i = 0; i < objs.length; i++) {
    const obj = objs[i]!;
    const startTime = obj.time;

    if (i > 0 && startTime - prevStartTime < MIN_FRAME_SEP_ALTERNATING) buttonIndex++;
    else buttonIndex = 0;
    prevStartTime = startTime;

    let targetX: number;
    let targetY: number;
    let spinnerStartAngle = 0;
    const isSpinner = obj.type === 'spinner';
    if (isSpinner) {

      const lf = lastFrame(frames);
      const dx = lf.x - SPINNER_CENTER_X;
      const dy = lf.y - SPINNER_CENTER_Y;
      spinnerStartAngle = dx === 0 && dy === 0 ? 0 : Math.atan2(dy, dx);
      targetX = SPINNER_CENTER_X + Math.cos(spinnerStartAngle) * SPIN_RADIUS;
      targetY = SPINNER_CENTER_Y + Math.sin(spinnerStartAngle) * SPIN_RADIUS;
    } else {
      const o = obj as HitCircle | Slider;
      const shift = o.stackHeight * radius / 10;
      targetX = o.x - shift;
      targetY = fy(o.y) - shift;
    }

    yield* moveToObject(frames, targetX, targetY, startTime, modDiff.preemptMs, isSpinner, releaseTime);

    let bits = buttonIndex % 2 === 0 ? LEFT : RIGHT;
    if ((lastFrame(frames).keys & bits) !== 0) bits = bits === LEFT ? RIGHT : LEFT;
    yield emit(frames, { time: startTime, x: targetX, y: targetY, keys: bits });

    if (obj.type === 'circle') {
      releaseTime = startTime + KEY_UP_DELAY;
    } else if (obj.type === 'slider') {
      releaseTime = yield* followSlider(frames, beatmap, obj, bits, radius, fy);
    } else {
      releaseTime = yield* spinSpinner(frames, obj, bits, spinnerStartAngle);
    }
  }

  const lf = lastFrame(frames);
  yield emit(frames, { time: releaseTime, x: lf.x, y: lf.y, keys: 0 });
}
