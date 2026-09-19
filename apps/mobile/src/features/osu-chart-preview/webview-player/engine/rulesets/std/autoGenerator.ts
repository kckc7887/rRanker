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

// Faithful port of ppy/osu OsuAutoGenerator / OsuAutoGeneratorBase. Emits a cursor
// track that presses on each stacked object centre at its start time, so the
// press-centric std hit judge re-derives all-300s → SS. Coordinate space is
// osu!pixels on the stacked layout (stacking already applied to `beatmap`).
//
// One deviation from lazer for smoothness: the cursor glides continuously across the
// whole gap between objects and releases the held key *mid-glide* at the key-up time,
// rather than parking on the note for KEY_UP_DELAY ms before darting. On dense streams
// the park is ~half the inter-note time, which reads as a jagged stutter.

type Point = { x: number; y: number };

const FRAME_STEP = 1000 / 60;          // 60 fps movement/slider/spinner sampling (~16.667 ms)
const REACTION_TIME = 100;             // cursor starts moving REACTION_TIME before a note becomes pressable
const KEY_UP_DELAY = 50;               // button stays held this long past an object's end
const MIN_FRAME_SEP_ALTERNATING = 266; // below this gap to the previous object, alternate hands
const SPIN_RADIUS = 50;
const SPIN_RATE = 0.05;                // rad/ms (~477 RPM) — comfortably over any spin requirement
const SPINNER_CENTER_X = 256;
const SPINNER_CENTER_Y = 192;

// Set BOTH the mouse and key bit for the chosen hand so the judge (scans 0b1111) and
// the key overlay both react. Left = M1|K1, Right = M2|K2.
const LEFT = 0b0101;   // 1 | 4
const RIGHT = 0b1010;  // 2 | 8

// Component-wise eased lerp fraction. Out = decelerate into the target (default,
// between objects); In = accelerate (entering a spinner from outside the spin circle).
function easeOut(t: number): number { return t * (2 - t); }
function easeIn(t: number): number { return t * t; }

function lastFrame(frames: AutoFrame[]): AutoFrame { return frames[frames.length - 1]!; }

// Repeat-aware path fraction, mirroring the std hit judge's sliderBallPos. Auto only
// needs to stay within the follow radius, so exact ball parity isn't required.
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

// Ease the cursor from its current resting frame to (targetX, targetY), arriving exactly
// at `startTime`. The previous object's button is held until `releaseTime` and released
// inline (no stationary park on the note). For spaced objects the cursor still waits in
// place until REACTION_TIME before the note (Auto doesn't drift early).
function moveToObject(
  frames: AutoFrame[], targetX: number, targetY: number,
  startTime: number, preemptMs: number, useIn: boolean, releaseTime: number,
): void {
  const lf = lastFrame(frames);
  const { x: startX, y: startY } = lf;
  let holdKeys = lf.keys;

  const waitTime = startTime - Math.max(0, preemptMs - REACTION_TIME);
  let fromTime = lf.time;
  if (waitTime > lf.time) {
    // Spaced object: release the held key on time, then park until the reaction window.
    if (holdKeys !== 0 && releaseTime <= waitTime) {
      frames.push({ time: releaseTime, x: startX, y: startY, keys: 0 });
      holdKeys = 0;
    }
    frames.push({ time: waitTime, x: startX, y: startY, keys: holdKeys });
    fromTime = waitTime;
  }

  const dur = startTime - fromTime;
  if (dur <= 0) return;
  const ease = useIn ? easeIn : easeOut;
  for (let t = fromTime + FRAME_STEP; t < startTime; t += FRAME_STEP) {
    if (holdKeys !== 0 && t >= releaseTime) holdKeys = 0;   // key-up mid-glide (±1 frame)
    const e = ease((t - fromTime) / dur);
    frames.push({
      time: Math.trunc(t),
      x: startX + (targetX - startX) * e,
      y: startY + (targetY - startY) * e,
      keys: holdKeys,
    });
  }
}

// Hold the button along the slider path, ending on the exact tail (still held — the
// next move releases it). Returns the key-up time.
function followSlider(
  frames: AutoFrame[], beatmap: BeatmapData, slider: Slider, bits: number, radius: number,
  fy: (y: number) => number,
): number {
  const path     = sampleSlider(slider);
  const slideDur = slideDurationMs(beatmap, slider);
  const endTime  = slider.time + slideDur * slider.slides;
  const shift    = slider.stackHeight * radius / 10;

  for (let t = slider.time + FRAME_STEP; t < endTime; t += FRAME_STEP) {
    const p = sliderBallPos(path, t, slider.time, slideDur, slider.slides);
    frames.push({ time: Math.trunc(t), x: p.x - shift, y: fy(p.y) - shift, keys: bits });
  }
  const pEnd = sliderBallPos(path, endTime, slider.time, slideDur, slider.slides);
  frames.push({ time: endTime, x: pEnd.x - shift, y: fy(pEnd.y) - shift, keys: bits });
  return endTime + KEY_UP_DELAY;
}

// Circle the spin centre at SPIN_RATE, holding the button (still held at the end — the
// next move releases it). Returns the key-up time (1 ms later than a normal object).
function spinSpinner(frames: AutoFrame[], spinner: Spinner, bits: number, startAngle: number): number {
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
    frames.push({ time: Math.trunc(t), x: p.x, y: p.y, keys: bits });
  }
  angle += (spinner.endTime - prevT) * SPIN_RATE;
  const pEnd = at(angle);
  frames.push({ time: spinner.endTime, x: pEnd.x, y: pEnd.y, keys: bits });
  return spinner.endTime + KEY_UP_DELAY + 1;
}

/**
 * Generate a perfect ("Auto") osu!standard replay for `beatmap`: a 60 fps cursor
 * track in osu!pixels whose presses score all-300s under this library's judge.
 * `modDiff` supplies the mod-adjusted radius/preempt and the HR flip; times are
 * beatmap-clock milliseconds.
 */
export function generateStdAutoReplay(beatmap: BeatmapData, modDiff: ModDifficulty): AutoFrame[] {
  const objs = beatmap.hitObjects;
  if (objs.length === 0) return [];

  const radius = modDiff.circleRadiusPx;
  // HR flips Y about the playfield centre at query time (hitJudge `fy`), never mutating raw
  // positions; the generated cursor must land on the same flipped layout the judge compares
  // (circle/slider-head: `fy(obj.y) - stackShift`; slider ball: `fy(raw.y) - stackShift`).
  // Stacking is on original positions, so the shift is subtracted AFTER the flip, as in the judge.
  const fy = modDiff.isHR ? (y: number) => 384 - y : (y: number) => y;
  const frames: AutoFrame[] = [];

  // First frame: cursor parked below the playfield, 1500 ms before the first note.
  frames.push({ time: objs[0]!.time - 1500, x: 256, y: 500, keys: 0 });

  let buttonIndex = 0;
  let prevStartTime = -Infinity;
  // Key-up time for the currently-held object (consumed by the next move). -Infinity = nothing held.
  let releaseTime = -Infinity;

  for (let i = 0; i < objs.length; i++) {
    const obj = objs[i]!;
    const startTime = obj.time;

    // Dense streams flip hands; objects spaced ≥266 ms reset to the left button.
    if (i > 0 && startTime - prevStartTime < MIN_FRAME_SEP_ALTERNATING) buttonIndex++;
    else buttonIndex = 0;
    prevStartTime = startTime;

    let targetX: number;
    let targetY: number;
    let spinnerStartAngle = 0;
    const isSpinner = obj.type === 'spinner';
    if (isSpinner) {
      // Enter the spin circle radially from wherever the cursor currently sits.
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

    moveToObject(frames, targetX, targetY, startTime, modDiff.preemptMs, isSpinner, releaseTime);

    // Press the alternating hand, but flip if the previous frame still holds it —
    // an overlapping object would otherwise produce no fresh key edge (a missed press).
    let bits = buttonIndex % 2 === 0 ? LEFT : RIGHT;
    if ((lastFrame(frames).keys & bits) !== 0) bits = bits === LEFT ? RIGHT : LEFT;
    frames.push({ time: startTime, x: targetX, y: targetY, keys: bits });

    if (obj.type === 'circle') {
      releaseTime = startTime + KEY_UP_DELAY;
    } else if (obj.type === 'slider') {
      releaseTime = followSlider(frames, beatmap, obj, bits, radius, fy);
    } else {
      releaseTime = spinSpinner(frames, obj, bits, spinnerStartAngle);
    }
  }

  // Release the final object's button (no subsequent move to consume it).
  const lf = lastFrame(frames);
  frames.push({ time: releaseTime, x: lf.x, y: lf.y, keys: 0 });

  return frames;
}
