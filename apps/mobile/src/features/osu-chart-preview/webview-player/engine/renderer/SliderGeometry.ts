/*!
 * Source: https://github.com/daladal/replayviewer-js
 *
 * MIT License
 *
 * Copyright (c) 2026 bog
 * Copyright (c) 2024 ppy Pty Ltd <contact@ppy.sh>.
 * Catmull: https://github.com/ppy/osu-framework/blob/master/osu.Framework/Utils/PathApproximator.cs
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
import type { Slider } from '../types/index';
import { lowerBoundBy } from '../../../../chart-preview-shared/webview-player/sorted-search';

type Point = { x: number; y: number };
export type SliderPath = { points: Point[]; distances: number[] };
const paths = new WeakMap<Slider, SliderPath>();
const TOLERANCE = 0.05;
const distance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);
const lerp = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

export function sliderPointAt(path: SliderPath, fraction: number): Point {
  const { points, distances } = path;
  if (fraction <= 0 || points.length === 1) return points[0]!;
  if (fraction >= 1) return points.at(-1)!;
  const at = fraction * distances.at(-1)!;
  const i = Math.max(
    1,
    lowerBoundBy(distances, at, (d) => d),
  );
  return lerp(points[i - 1]!, points[i]!, (at - distances[i - 1]!) / (distances[i]! - distances[i - 1]!));
}

export function sliderProgress(time: number, start: number, duration: number, repeats: number): number {
  const progress = Math.max(0, Math.min(repeats, (time - start) / duration));
  const pass = Math.min(Math.floor(progress), repeats - 1);
  return pass % 2 ? 1 - (progress - pass) : progress - pass;
}

function fitLength(raw: Point[], length: number, tangent?: Point): SliderPath {
  const points = [raw[0]!],
    distances = [0];
  let total = 0;
  for (let i = 1; i < raw.length; i++) {
    const a = raw[i - 1]!,
      b = raw[i]!,
      span = distance(a, b);
    if (!span) continue;
    if (total + span >= length) {
      points.push(lerp(a, b, (length - total) / span));
      distances.push(length);
      return { points, distances };
    }
    total += span;
    points.push(b);
    distances.push(total);
  }
  if (points.length > 1 && total < length) {
    const end = points.at(-1)!,
      prev = tangent ?? points.at(-2)!;
    points.push(lerp(end, prev, -(length - total) / distance(end, prev)));
    distances.push(length);
  }
  return { points, distances };
}

/* 折返的控制点可能与首尾共线；同时比较控制多边形弧长，保留回折尖端。 */
function flat(points: Point[]): boolean {
  const a = points[0]!,
    b = points.at(-1)!,
    chord = distance(a, b);
  let polygon = 0;
  for (let i = 1; i < points.length; i++) {
    const p = points[i]!;
    polygon += distance(points[i - 1]!, p);
    if (Math.abs((p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x)) > chord * TOLERANCE) return false;
  }
  return polygon - chord <= TOLERANCE;
}

function appendBezier(path: Point[], controls: Point[]): void {
  const pending = [controls];
  while (pending.length) {
    const points = pending.pop()!;
    if (points.length < 3 || flat(points)) {
      path.push(points.at(-1)!);
      continue;
    }
    const row = points.slice(),
      left = [row[0]!],
      right = [row.at(-1)!];
    for (let n = row.length - 1; n; n--) {
      for (let i = 0; i < n; i++) row[i] = lerp(row[i]!, row[i + 1]!, 0.5);
      left.push(row[0]!);
      right.push(row[n - 1]!);
    }
    pending.push(right.reverse(), left);
  }
}

function curvedPath(slider: Slider): SliderPath {
  const controls = slider.curvePoints,
    raw = [controls[0]!];
  if (slider.curveType === 'C') {
    for (let i = 0; i < controls.length - 1; i++) {
      const a = controls[i]!,
        b = controls[i + 1]!;
      const before = controls[Math.max(0, i - 1)]!,
        after = controls[i + 2] ?? lerp(a, b, 2);
      appendBezier(raw, [
        a,
        { x: a.x + (b.x - before.x) / 6, y: a.y + (b.y - before.y) / 6 },
        { x: b.x - (after.x - a.x) / 6, y: b.y - (after.y - a.y) / 6 },
        b,
      ]);
    }
  } else {
    let start = 0;
    for (let i = 1; i < controls.length; i++) {
      const p = controls[i]!,
        next = controls[i + 1];
      if (next && (next.x !== p.x || next.y !== p.y)) continue;
      appendBezier(raw, controls.slice(start, i + 1));
      start = i + 1;
    }
  }
  const end = controls.at(-1)!;
  let i = controls.length - 2;
  while (i >= 0 && !distance(end, controls[i]!)) i--;
  return fitLength(raw, slider.length, controls[i]);
}

function circularPath(slider: Slider): SliderPath {
  const [a, b, c] = slider.curvePoints as [Point, Point, Point];
  const det = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(det) < 1e-6) return fitLength(slider.curvePoints, slider.length);
  const aa = a.x * a.x + a.y * a.y,
    bb = b.x * b.x + b.y * b.y,
    cc = c.x * c.x + c.y * c.y;
  const x = (aa * (b.y - c.y) + bb * (c.y - a.y) + cc * (a.y - b.y)) / det;
  const y = (aa * (c.x - b.x) + bb * (a.x - c.x) + cc * (b.x - a.x)) / det;
  const radius = Math.hypot(a.x - x, a.y - y),
    tau = Math.PI * 2;
  const start = Math.atan2(a.y - y, a.x - x);
  const sweepTo = (p: Point) => (Math.atan2(p.y - y, p.x - x) - start + tau) % tau;
  const end = sweepTo(c);
  const sweep = sweepTo(b) < end ? end : end - tau;
  const length = Math.min(slider.length, Math.abs(sweep) * radius);
  const angle = (Math.sign(sweep) * length) / radius;
  /* 用弦高控制圆弧误差，弧长表仍记录真实圆弧距离。 */
  const step = 4 * Math.asin(Math.sqrt(Math.min(1, TOLERANCE / (2 * radius))));
  const count = Math.max(1, Math.ceil(Math.abs(angle) / step));
  const points = [a],
    distances = [0];
  for (let i = 1; i <= count; i++) {
    const direction = start + (angle * i) / count;
    points.push({ x: x + radius * Math.cos(direction), y: y + radius * Math.sin(direction) });
    distances.push((length * i) / count);
  }
  if (slider.length > length) {
    const extension = (slider.length - length) * Math.sign(sweep),
      direction = start + sweep;
    points[points.length - 1] = c;
    points.push({ x: c.x - Math.sin(direction) * extension, y: c.y + Math.cos(direction) * extension });
    distances.push(slider.length);
  }
  return { points, distances };
}

export function sampleSlider(slider: Slider): SliderPath {
  let path = paths.get(slider);
  if (!path) {
    if (slider.curveType === 'L') path = fitLength(slider.curvePoints, slider.length);
    else if (slider.curveType === 'P' && slider.curvePoints.length === 3) path = circularPath(slider);
    else path = curvedPath(slider);
    paths.set(slider, path);
  }
  return path;
}
