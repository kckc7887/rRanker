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
import type { BeatmapData, Slider } from '../types/index';

type Point = { x: number; y: number };

const _sliderPathCache = new WeakMap<Slider, Point[]>();

/** 按弧长重采样至约 1 点/osu!像素。 */
export function sampleSlider(slider: Slider): Point[] {
  let cached = _sliderPathCache.get(slider);
  if (cached === undefined) {
    cached = computeSliderPath(slider);
    _sliderPathCache.set(slider, cached);
  }
  return cached;
}

function computeSliderPath(slider: Slider): Point[] {
  const { curveType, curvePoints, length } = slider;
  switch (curveType) {
    case 'L': return sampleLinear(curvePoints, length);
    case 'P': return samplePerfectCircle(curvePoints, length);
    case 'C': return sampleCatmull(curvePoints, length);
    case 'B':
    default:
      return sampleBezier(curvePoints, length);
  }
}

export function warmSliderPaths(beatmap: BeatmapData): void {
  for (const obj of beatmap.hitObjects) {
    if (obj.type === 'slider') sampleSlider(obj);
  }
}

export function sampleLinear(points: Point[], length: number): Point[] {
  if (points.length === 0) return [];
  if (points.length === 1 || length <= 0) return [{ ...points[0]! }];

  return samplePolyline(points, length, Math.max(2, Math.ceil(length) + 1));
}

function sampleCatmull(points: Point[], length: number): Point[] {
  if (points.length < 2 || length <= 0) return points.slice(0, 1);
  const path: Point[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const p1 = points[Math.max(0, index - 1)]!;
    const p2 = points[index]!;
    const p3 = points[index + 1]!;
    const p4 = points[index + 2] ?? { x: 2 * p3.x - p2.x, y: 2 * p3.y - p2.y };
    for (let step = index === 0 ? 0 : 1; step <= 50; step += 1) {
      const t = step / 50;
      const coordinate = (key: 'x' | 'y'): number => 0.5 * (2 * p2[key]
        + (-p1[key] + p3[key]) * t
        + (2 * p1[key] - 5 * p2[key] + 4 * p3[key] - p4[key]) * t * t
        + (-p1[key] + 3 * p2[key] - 3 * p3[key] + p4[key]) * t * t * t);
      path.push({ x: coordinate('x'), y: coordinate('y') });
    }
  }
  return samplePolyline(path, length, Math.max(2, Math.ceil(length) + 1));
}

/** 重复控制点是红锚，切分为独立贝塞尔段。 */
export function sampleBezier(points: Point[], length: number): Point[] {
  if (points.length === 0) return [];
  if (points.length === 1 || length <= 0) return [{ ...points[0]! }];

  const segments = splitBezierSegments(points);
  const densePoly: Point[] = [];

  for (const seg of segments) {
    const polyLen = controlPolygonLength(seg);
    const nDense = Math.max(2, Math.ceil(polyLen) + 1);

    const first = densePoly.length === 0;
    for (let i = first ? 0 : 1; i < nDense; i++) {
      densePoly.push(evalBezier(seg, i / (nDense - 1)));
    }
  }

  return samplePolyline(densePoly, length, Math.max(2, Math.ceil(length) + 1));
}

/** 三点共线按直线；非三点 P 曲线按贝塞尔处理。 */
export function samplePerfectCircle(points: Point[], length: number): Point[] {
  if (points.length !== 3) return sampleBezier(points, length);
  if (length <= 0) return [{ ...points[0]! }];

  const [a, b, c] = [points[0]!, points[1]!, points[2]!];
  const D = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(D) < 1e-6) {
    return sampleLinear(points, length);
  }

  const a2 = a.x * a.x + a.y * a.y;
  const b2 = b.x * b.x + b.y * b.y;
  const c2 = c.x * c.x + c.y * c.y;

  const ox = (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / D;
  const oy = (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / D;

  const radius = Math.hypot(a.x - ox, a.y - oy);

  const startAngle = Math.atan2(a.y - oy, a.x - ox);
  const midAngle   = Math.atan2(b.y - oy, b.x - ox);
  const endAngle   = Math.atan2(c.y - oy, c.x - ox);

  /** 从 A 逆时针先到 B 再到 C 时，弧线逆时针展开。 */
  const midNorm = normalizeAngle(midAngle - startAngle);
  const endNorm = normalizeAngle(endAngle - startAngle);
  const sweepAngle = midNorm < endNorm ? endNorm : endNorm - 2 * Math.PI;

  const arcLength = Math.abs(sweepAngle) * radius;
  const sampledLength = Math.min(length, arcLength);
  const sampledSweep = arcLength > 0 ? sweepAngle * sampledLength / arcLength : 0;
  const count = Math.max(2, Math.ceil(sampledLength) + 1);
  const result: Point[] = [];
  for (let i = 0; i < count; i++) {
    const angle = startAngle + sampledSweep * (i / (count - 1));
    result.push({ x: ox + radius * Math.cos(angle), y: oy + radius * Math.sin(angle) });
  }
  return length <= arcLength ? result : samplePolyline(result, length, Math.max(2, Math.ceil(length) + 1));
}

function splitBezierSegments(points: Point[]): Point[][] {
  const segments: Point[][] = [];
  let current: Point[] = [points[0]!];
  let i = 1;

  while (i < points.length) {
    current.push(points[i]!);
    if (
      i + 1 < points.length &&
      points[i]!.x === points[i + 1]!.x &&
      points[i]!.y === points[i + 1]!.y
    ) {
      segments.push(current);
      current = [points[i + 1]!];
      i += 2;
    } else {
      i++;
    }
  }

  if (current.length > 1) segments.push(current);
  return segments.length > 0 ? segments : [points];
}

function evalBezier(points: Point[], t: number): Point {
  let pts = points.map(p => ({ x: p.x, y: p.y }));
  for (let r = 1; r < pts.length; r++) {
    for (let j = 0; j < pts.length - r; j++) {
      pts[j] = {
        x: pts[j]!.x + (pts[j + 1]!.x - pts[j]!.x) * t,
        y: pts[j]!.y + (pts[j + 1]!.y - pts[j]!.y) * t,
      };
    }
  }
  return pts[0]!;
}

function controlPolygonLength(points: Point[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    len += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y);
  }
  return len;
}

function buildCumulativeDists(points: Point[]): number[] {
  const dists: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    dists.push(
      dists[i - 1]! + Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y)
    );
  }
  return dists;
}

function samplePolyline(pts: Point[], length: number, count: number): Point[] {
  const dists = buildCumulativeDists(pts);
  const total = dists[dists.length - 1]!;
  if (length > total && pts.length > 1) {
    const end = pts.at(-1)!;
    let previous = pts.length - 2;
    while (previous > 0 && dists[previous] === total) previous -= 1;
    const direction = pts[previous]!;
    const distance = Math.hypot(end.x - direction.x, end.y - direction.y);
    if (distance > 0) {
      const extension = (length - total) / distance;
      pts = [...pts, { x: end.x + (end.x - direction.x) * extension, y: end.y + (end.y - direction.y) * extension }];
      dists.push(length);
    }
  }
  const result: Point[] = [];
  for (let i = 0; i < count; i++) {
    const t = (i / (count - 1)) * length;
    result.push(lerpPolyline(pts, dists, t));
  }
  return result;
}

function lerpPolyline(points: Point[], dists: number[], t: number): Point {
  if (t <= 0) return { ...points[0]! };
  if (t >= dists[dists.length - 1]!) return { ...points[points.length - 1]! };

  let lo = 0;
  let hi = dists.length - 2;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (dists[mid + 1]! < t) lo = mid + 1;
    else hi = mid;
  }

  const segStart = dists[lo]!;
  const segEnd   = dists[lo + 1]!;
  const segLen   = segEnd - segStart;
  const frac     = segLen < 1e-10 ? 0 : (t - segStart) / segLen;

  const p0 = points[lo]!;
  const p1 = points[lo + 1]!;
  return {
    x: p0.x + (p1.x - p0.x) * frac,
    y: p0.y + (p1.y - p0.y) * frac,
  };
}

function normalizeAngle(a: number): number {
  const TWO_PI = 2 * Math.PI;
  return ((a % TWO_PI) + TWO_PI) % TWO_PI;
}
