export type XY = [number, number];
export type Matrix = [number, number, number, number, number, number];
export type Contour = { points: XY[]; closed: boolean };
export const identity = (): Matrix => [1, 0, 0, 1, 0, 0];
export const point = (m: Matrix, x: number, y: number): XY => [
  m[0] * x + m[2] * y + m[4],
  m[1] * x + m[3] * y + m[5],
];
export function multiply(m: Matrix, a: number, b: number, c: number, d: number, e: number, f: number): Matrix {
  return [m[0] * a + m[2] * b, m[1] * a + m[3] * b, m[0] * c + m[2] * d, m[1] * c + m[3] * d, ...point(m, e, f)];
}
export function inverse(m: Matrix): Matrix {
  const [a, b, c, d, e, f] = m,
    det = a * d - b * c;
  return det ? [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det] : identity();
}

const cross = (a: XY, b: XY, c: XY) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const equal = (a: XY, b: XY) => Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6;
export function triangulate(input: readonly XY[]): XY[] {
  const points = input.filter((p, i) => !equal(p, input[(i + input.length - 1) % input.length]!));
  if (points.length < 3) return [];
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!,
      q = points[(i + 1) % points.length]!;
    area += p[0] * q[1] - p[1] * q[0];
  }
  if (area < 0) points.reverse();
  const output: XY[] = [];
  if (
    points.every(
      (p, i) =>
        cross(points[(i + points.length - 1) % points.length]!, p, points[(i + 1) % points.length]!) >= -1e-6,
    )
  ) {
    for (let i = 2; i < points.length; i++) output.push(points[0]!, points[i - 1]!, points[i]!);
    return output;
  }
  while (points.length > 2) {
    let clipped = false;
    for (let i = 0; i < points.length; i++) {
      const prev = (i + points.length - 1) % points.length,
        next = (i + 1) % points.length;
      const a = points[prev]!,
        b = points[i]!,
        c = points[next]!;
      if (Math.abs(cross(a, b, c)) < 1e-7) {
        points.splice(i, 1);
        clipped = true;
        break;
      }
      if (
        cross(a, b, c) < 0 ||
        points.some(
          (p, k) =>
            k !== i &&
            k !== prev &&
            k !== next &&
            cross(a, b, p) >= 0 &&
            cross(b, c, p) >= 0 &&
            cross(c, a, p) >= 0,
        )
      )
        continue;
      output.push(a, b, c);
      points.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;
  }
  return output;
}

export function arcSteps(radius: number, angle: number): number {
  return Math.max(2, Math.min(512, Math.ceil(Math.abs(angle) * Math.sqrt(Math.max(1, radius)))));
}

export function strokeTriangles(
  contour: Contour,
  radius: number,
  cap: CanvasLineCap,
  join: CanvasLineJoin,
  miterLimit: number,
): XY[] {
  const pts = contour.points.filter((p, i, list) => !i || !equal(p, list[i - 1]!));
  const result: XY[] = [];
  if (pts.length < 2 || radius <= 0) return result;
  const closed = contour.closed || equal(pts[0]!, pts[pts.length - 1]!);
  if (closed && equal(pts[0]!, pts[pts.length - 1]!)) pts.pop();
  if (pts.length < 2) return result;
  const n = pts.length,
    segments = closed ? n : n - 1;
  const normals: XY[] = [];
  for (let i = 0; i < segments; i++) {
    const a = pts[i]!,
      b = pts[(i + 1) % n]!,
      dx = b[0] - a[0],
      dy = b[1] - a[1],
      len = Math.hypot(dx, dy);
    normals.push([-dy / len, dx / len]);
  }
  const fan = (p: XY, start: number, delta: number) => {
    const count = arcSteps(radius, delta);
    let prev: XY = [p[0] + Math.cos(start) * radius, p[1] + Math.sin(start) * radius];
    for (let i = 1; i <= count; i++) {
      const a = start + (delta * i) / count,
        end: XY = [p[0] + Math.cos(a) * radius, p[1] + Math.sin(a) * radius];
      result.push(p, prev, end);
      prev = end;
    }
  };
  const corners: { left: XY; right: XY; exitLeft: XY; exitRight: XY }[] = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i]!,
      prev = normals[(i + segments - 1) % segments]!,
      next = normals[i % segments]!;
    if (!closed && (i === 0 || i === n - 1)) {
      const normal = i === 0 ? next : prev,
        dir = i === 0 ? -1 : 1;
      const extra = cap === 'square' ? dir * radius : 0;
      const x = p[0] + normal[1] * extra,
        y = p[1] - normal[0] * extra;
      const l: XY = [x + normal[0] * radius, y + normal[1] * radius],
        r: XY = [x - normal[0] * radius, y - normal[1] * radius];
      corners.push({ left: l, right: r, exitLeft: l, exitRight: r });
      if (cap === 'round') fan(p, Math.atan2(normal[1], normal[0]) + (i === 0 ? 0 : Math.PI), Math.PI);
      continue;
    }
    const den = 1 + prev[0] * next[0] + prev[1] * next[1];
    const mx = (prev[0] + next[0]) / Math.max(0.000001, den),
      my = (prev[1] + next[1]) / Math.max(0.000001, den);
    const turn = prev[0] * next[1] - prev[1] * next[0];
    const miter = Math.hypot(mx, my);
    const offset = (x: number, y: number, s: number): XY => [p[0] + x * radius * s, p[1] + y * radius * s];
    if (den > 1e-5 && (miter <= 1.005 || (join === 'miter' && miter <= miterLimit))) {
      const l = offset(mx, my, 1),
        r = offset(mx, my, -1);
      corners.push({ left: l, right: r, exitLeft: l, exitRight: r });
      continue;
    }
    const s = turn >= 0 ? -1 : 1,
      a = offset(prev[0], prev[1], s),
      b = offset(next[0], next[1], s);
    const inner = miter <= miterLimit ? offset(mx, my, -s) : p;
    if (s > 0) corners.push({ left: a, right: inner, exitLeft: b, exitRight: inner });
    else corners.push({ left: inner, right: a, exitLeft: inner, exitRight: b });
    if (join === 'round') {
      const angle = Math.atan2(prev[1] * s, prev[0] * s),
        delta = Math.atan2(turn, den - 1);
      fan(p, angle, delta);
      result.push(inner, a, p, inner, p, b);
    } else result.push(inner, a, b);
  }
  for (let i = 0; i < segments; i++) {
    const a = corners[i]!,
      b = corners[(i + 1) % n]!;
    result.push(a.exitLeft, a.exitRight, b.left, b.left, a.exitRight, b.right);
  }
  return result;
}
