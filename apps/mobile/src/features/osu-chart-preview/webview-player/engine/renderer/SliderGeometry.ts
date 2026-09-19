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
import type { BeatmapData, Slider } from '../types/index';

type Point = { x: number; y: number };

// Shared across HitObjectRenderer, FollowpointRenderer, and hit judgement.
const _sliderPathCache = new WeakMap<Slider, Point[]>();

/**
 * Sample a slider's curve into a dense, arc-length-parametrized polyline in osu!pixels
 * (~1 point per pixel of length). Memoized per Slider object (WeakMap) — Bézier
 * resampling is milliseconds-expensive on Firefox's software canvas path.
 */
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
    case 'C':
    case 'B':
    default:
      return sampleBezier(curvePoints, length);
  }
}

/** Pre-sample every slider path in the beatmap so the first rendered frame doesn't pay
 * Bézier-sampling stalls on long maps (Firefox is ms-per-sample). Safe to call repeatedly. */
export function warmSliderPaths(beatmap: BeatmapData): void {
  for (const obj of beatmap.hitObjects) {
    if (obj.type === 'slider') sampleSlider(obj);
  }
}

/** Sample a linear ('L') slider path: evenly spaced points along the control polyline,
 * clamped/extended to the .osu-declared `length` (osu!pixels). */
export function sampleLinear(points: Point[], length: number): Point[] {
  if (points.length === 0) return [];
  if (points.length === 1 || length <= 0) return [{ ...points[0]! }];

  const count = Math.max(2, Math.ceil(length) + 1);
  const dists = buildCumulativeDists(points);
  const clampedLen = Math.min(length, dists[dists.length - 1]!);

  const result: Point[] = [];
  for (let i = 0; i < count; i++) {
    const t = (i / (count - 1)) * clampedLen;
    result.push(lerpPolyline(points, dists, t));
  }
  return result;
}

/** Sample a Bézier ('B'/'C') slider path. Piecewise: repeated control points (red anchors)
 * split the curve into independent Bézier sub-segments; the dense result is re-sampled to
 * even arc-length spacing over `length` osu!pixels. */
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

/** Sample a perfect-circle ('P') slider path: the arc through 3 control points, swept for
 * `length` osu!pixels. Falls back to linear for collinear points and to Bézier when not
 * exactly 3 control points (matching osu!). */
export function samplePerfectCircle(points: Point[], length: number): Point[] {
  if (points.length !== 3) return sampleBezier(points, length);
  if (length <= 0) return [{ ...points[0]! }];

  const [a, b, c] = [points[0]!, points[1]!, points[2]!];
  const count = Math.max(2, Math.ceil(length) + 1);

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

  // Sweep is CCW iff B comes before C going CCW from A.
  const midNorm = normalizeAngle(midAngle - startAngle);
  const endNorm = normalizeAngle(endAngle - startAngle);
  const sweepAngle = midNorm < endNorm ? endNorm : endNorm - 2 * Math.PI;

  const arcLength = Math.abs(sweepAngle) * radius;
  const clampedSweep = arcLength > 0 ? sweepAngle * Math.min(1, length / arcLength) : 0;

  const result: Point[] = [];
  for (let i = 0; i < count; i++) {
    const angle = startAngle + clampedSweep * (i / (count - 1));
    result.push({ x: ox + radius * Math.cos(angle), y: oy + radius * Math.sin(angle) });
  }
  return result;
}

// Red anchors are consecutive duplicate control points.
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
  const clampedLen = Math.min(length, dists[dists.length - 1]!);
  const result: Point[] = [];
  for (let i = 0; i < count; i++) {
    const t = (i / (count - 1)) * clampedLen;
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
