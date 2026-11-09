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
import type { BeatmapData, Slider } from '../../types/index';
import type { ModDifficulty } from '../../utils/modDifficulty';
import type { AutoFrame } from '../../utils/autoReplay';
import { sampleSlider, sliderPointAt, sliderProgress } from '../../renderer/SliderGeometry';
import { slideDurationMs } from '../../utils/sliderDuration';

/** 参考 ppy/osu OsuAutoGenerator；光标按堆叠后的 osu!px 坐标移动。 */

type Point = { x: number; y: number };
type Motion =
  | { type: 'point'; time: number; at: Point }
  | { type: 'move'; time: number; end: number; from: Point; to: Point; spin: boolean }
  | { type: 'slide'; time: number; duration: number; slider: Slider; shift: number; flip: boolean }
  | { type: 'spin'; time: number; end: number; angle: number };
export type StdMotion = Motion[];
export const SPIN_RATE = 0.05;

function position(motion: Motion, time: number): Point {
  switch (motion.type) {
    case 'point':
      return motion.at;
    case 'move': {
      let t = Math.max(0, Math.min(1, (time - motion.time) / (motion.end - motion.time)));
      t = motion.spin ? t * t : t * (2 - t);
      return {
        x: motion.from.x + (motion.to.x - motion.from.x) * t,
        y: motion.from.y + (motion.to.y - motion.from.y) * t,
      };
    }
    case 'spin': {
      const angle = motion.angle + (Math.min(time, motion.end) - motion.time) * SPIN_RATE;
      return { x: 256 + Math.cos(angle) * 50, y: 192 + Math.sin(angle) * 50 };
    }
    case 'slide': {
      const progress = sliderProgress(time, motion.time, motion.duration, motion.slider.slides);
      const { x, y } = sliderPointAt(sampleSlider(motion.slider), progress);
      return { x: x - motion.shift, y: (motion.flip ? 384 - y : y) - motion.shift };
    }
  }
}

export function autoCursorAt(motions: StdMotion, time: number): Point {
  let lo = 0,
    hi = motions.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (motions[mid]!.time <= time) lo = mid + 1;
    else hi = mid;
  }
  return position(motions[Math.max(0, lo - 1)]!, time);
}

export function* generateStdAutoReplay(
  beatmap: BeatmapData,
  modDiff: ModDifficulty,
  motions: StdMotion,
): Generator<AutoFrame> {
  const objects = beatmap.hitObjects;
  if (!objects.length) return;
  let at = { x: 256, y: 500 },
    end = objects[0]!.time - 1500,
    release = end,
    bits = 0,
    hand = 0;
  motions.push({ type: 'point', time: end, at });
  yield { time: end, ...at, keys: 0 };
  for (let i = 0; i < objects.length; i++) {
    const object = objects[i]!,
      time = object.time;
    const isSpin = object.type === 'spinner';
    const angle = Math.atan2(at.y - 192, at.x - 256);
    const shift = !isSpin ? (object.stackHeight * modDiff.circleRadiusPx) / 10 : 0;
    const head = isSpin
      ? { x: 256 + Math.cos(angle) * 50, y: 192 + Math.sin(angle) * 50 }
      : { x: object.x - shift, y: (modDiff.isHR ? 384 - object.y : object.y) - shift };
    const from = Math.max(end, time - Math.max(0, modDiff.preemptMs - 100));
    if (from < time) motions.push({ type: 'move', time: from, end: time, from: at, to: head, spin: isSpin });
    if (bits && release < time) {
      const point = from < time && release >= from ? position(motions[motions.length - 1]!, release) : at;
      yield { time: release, ...point, keys: 0 };
      bits = 0;
    }
    hand = i && time - objects[i - 1]!.time < 266 ? hand + 1 : 0;
    let next = hand % 2 ? 10 : 5;
    if (bits & next) next = next === 10 ? 5 : 10;
    bits = next;
    yield { time, ...head, keys: bits };
    let segment: Motion;
    if (object.type === 'slider') {
      const duration = slideDurationMs(beatmap, object);
      segment = { type: 'slide', time, duration, slider: object, shift, flip: modDiff.isHR };
      end = time + duration * object.slides;
    } else if (object.type === 'spinner') {
      segment = { type: 'spin', time, end: object.endTime, angle };
      end = object.endTime;
    } else {
      segment = { type: 'point', time, at: head };
      end = time;
    }
    motions.push(segment);
    at = position(segment, end);
    release = end + (isSpin ? 51 : 50);
  }
  yield { time: release, ...at, keys: 0 };
}
