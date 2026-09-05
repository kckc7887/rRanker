/** TypeScript adaptation of MajdataViewX MajGeo, SlideCodeParser, SlideDataBuilder and
 * SlideTableNeo (GPL-3.0). Preserves path units, tangent convention and arrow alignment.
 * See scripts/maimai-reference/ViewX and THIRD_PARTY_NOTICES.md. */
import { AREA_LOOKUP, SLIDE_TABLE } from './slideTable.generated';
import type { SlideBranch, SlideSegment } from '../../types';
export type Pose = { x: number; y: number; angle: number; length: number };
export type Geometry = { length: number; slideConst: number; omitLast: boolean; arrows: Pose[]; ok: Pose; okType: number; areas: number[][]; wifi: boolean };
type Vec = { x: number; y: number };
type Circle = { center: Vec; radius: number };
type Segment = { from: Vec; to: Vec; center?: Vec; start?: number; sweep?: number; length: number; marker?: 'smooth' | 'force'; step?: number };
const TAU = Math.PI * 2, R = 4.8, STEP = R * Math.PI / 32;
const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
const mul = (a: Vec, n: number): Vec => ({ x: a.x * n, y: a.y * n });
const mag = (a: Vec) => Math.hypot(a.x, a.y);
const arg = (a: Vec) => Math.atan2(a.y, a.x);
const polar = (r: number, a: number): Vec => ({ x: r * Math.cos(a), y: r * Math.sin(a) });
const normalAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
export const buttonPoint = (i: number, radius = R): Vec => polar(radius, Math.PI * (5 / 8 - i / 4));
const CENTER_R = R * Math.cos(Math.PI * 3 / 8), PP_R = R * Math.cos(Math.PI / 8) / 2;
function circle(i: number): Circle {
  if (i === 0 || i === 9) return { center: { x: 0, y: 0 }, radius: i ? R : CENTER_R };
  if (i < 1 || i > 8) throw new Error('Invalid orbit');
  return { center: polar(PP_R, Math.PI * (3 / 4 - i / 4)), radius: PP_R };
}
function tangent(p: Vec, c: Circle, ccw: boolean): number {
  const v = sub(p, c.center), quotient = c.radius / mag(v);
  if (quotient > 1 + 1e-8) throw new Error('Impossible orbit tangent');
  return normalAngle(arg(v) + (ccw ? 1 : -1) * Math.acos(Math.min(1, quotient)));
}
class Path {
  segments: Segment[] = [];
  constructor(public end: Vec) {}
  line(to: Vec) { const length = mag(sub(to, this.end)); if (length > 1e-10) this.segments.push({ from: this.end, to, length }); this.end = to; return this; }
  arc(center: Vec, endAngle: number, ccw: boolean, skip = false) {
    const v = sub(this.end, center), radius = mag(v);
    let start = arg(v), end = normalAngle(endAngle);
    if (Math.abs(end - start) < 0.002) { if (skip) return this; end += ccw ? TAU : -TAU; }
    if (ccw && start > end) start -= TAU;
    if (!ccw && start < end) start += TAU;
    const sweep = end - start, to = add(center, polar(radius, end));
    this.segments.push({ from: this.end, to, center, start, sweep, length: Math.abs(sweep) * radius });
    this.end = to; return this;
  }
  mark(marker: 'force' | 'smooth') { if (this.segments.length) this.segments[this.segments.length - 1].marker = marker; return this; }
  get length() { return this.segments.reduce((n, s) => n + s.length, 0); }
  at(distance: number): Pose & { curve: boolean } {
    let d = Math.max(0, distance), segment = this.segments[this.segments.length - 1];
    for (let i = 0; i < this.segments.length; i++) {
      const s = this.segments[i]; segment = s;
      if (d <= s.length || i === this.segments.length - 1) break;
      d -= s.length;
    }
    if (!segment) throw new Error('Empty slide path');
    const t = Math.min(1, d / segment.length);
    if (segment.center) {
      const angle = segment.start! + t * segment.sweep!;
      const point = add(segment.center, polar(mag(sub(segment.from, segment.center)), angle));
      return { ...point, angle: angle + (segment.sweep! > 0 ? Math.PI / 2 : -Math.PI / 2), length: distance, curve: true };
    }
    return { ...add(segment.from, mul(sub(segment.to, segment.from), t)), angle: arg(sub(segment.to, segment.from)), length: distance, curve: false };
  }
}
type Command = { type: string; value: number };
function node(c: Command): Vec {
  if (c.type === 'C') return { x: 0, y: 0 };
  if (c.value < 1 || c.value > 8) throw new Error('Invalid slide node');
  return buttonPoint(c.value, c.type === 'B' ? CENTER_R / Math.cos(Math.PI / 8) : R);
}
function transfer(i: number, ccw: boolean) {
  const b = Math.cos(Math.PI / 8) / 2, a = 1 - b, theta = Math.PI / 4;
  const s = (a * a + b * b - 2 * a * b * Math.cos(theta)) / (2 * a - 2 * b * Math.cos(theta));
  const delta = Math.acos((s * s + b * b - (a - s) ** 2) / (2 * b * s));
  const phi = Math.PI * (3 / 4 - i / 4), end = phi + (ccw ? theta : -theta);
  return { center: polar(R - R * (b + s), end), start: normalAngle(phi + (ccw ? -delta : delta)), end: normalAngle(end) };
}
function parseCustom(code: string): Path {
  if (!/^[1-8][ABCPQK]/.test(code) || !/K[1-8]$/.test(code)) throw new Error('Invalid custom slide');
  const commands: Command[] = [{ type: 'A', value: Number(code[0]) }];
  let type = 'A';
  for (const c of code.slice(1)) {
    if ('ABCPQK'.includes(c)) { type = c; if (type === 'C') commands.push({ type, value: 0 }); }
    else { if (!/\d/.test(c) || type === 'C') throw new Error('Invalid custom slide command'); commands.push({ type, value: Number(c) }); }
  }
  const path = new Path(node(commands[0]));
  for (let i = 1; i < commands.length; i++) {
    const last = commands[i - 1], current = commands[i];
    const lastOrbit = 'PQ'.includes(last.type), currentOrbit = 'PQ'.includes(current.type);
    if (!lastOrbit && !currentOrbit) { if (last.type === 'K') throw new Error('Unexpected end command'); path.line(node(current)); }
    else if (!lastOrbit) {
      const target = circle(current.value), ccw = current.type === 'P', p = node(last), distance = mag(sub(p, target.center));
      if (Math.abs(distance - target.radius) < 0.1) { if (last.type === 'A' && current.value === 9) path.mark('force'); }
      else path.line(add(target.center, polar(target.radius, tangent(p, target, ccw))));
    } else if (!currentOrbit) {
      const target = node(current), orbit = circle(last.value), ccw = last.type === 'P', v = sub(target, orbit.center);
      if (Math.abs(mag(v) - orbit.radius) < 0.1) path.arc(orbit.center, arg(v), ccw);
      else path.arc(orbit.center, tangent(target, orbit, !ccw), ccw).line(target);
    } else {
      if (last.type !== current.type) throw new Error('Orbit direction mismatch');
      const from = circle(last.value), to = circle(current.value), ccw = last.type === 'P';
      if (last.value === current.value) { path.arc(from.center, arg(sub(path.end, from.center)), ccw); continue; }
      if ((last.value === 0 && current.value === 9) || (last.value === 9 && current.value === 0)) throw new Error('Impossible orbit transfer');
      if (current.value === 9) { const t = transfer(last.value, ccw); path.arc(from.center, t.start, ccw).arc(t.center, t.end, ccw).mark('smooth'); }
      else if (last.value === 9) { const t = transfer(current.value, !ccw); path.arc(from.center, t.end, ccw, true).arc(t.center, t.start, ccw); }
      else {
        const radius = mag(sub(path.end, from.center));
        const end = Math.abs(radius - to.radius) < 0.0001 ? arg(sub(to.center, from.center)) + (ccw ? -Math.PI / 2 : Math.PI / 2)
          : to.radius > radius ? tangent(from.center, { center: to.center, radius: to.radius - radius }, ccw)
            : tangent(to.center, { center: from.center, radius: radius - to.radius }, !ccw);
        path.arc(from.center, end, ccw).line(add(to.center, polar(to.radius, end)));
      }
    }
  }
  return path;
}
function customAreas(path: Path): number[][] {
  const length = path.length, count = Math.round(length / 0.1), nodes: [number, number][] = [];
  let last: number | null = null, enter = 0;
  for (let i = 0; i < count; i++) {
    const d = i / count * length, p = path.at(d);
    let n: number | null = mag(p) < 0.55 ? 16 : null;
    if (n === null) for (let j = 0; j < 8; j++) {
      if (mag(sub(p, buttonPoint(j + 1, 4.4))) < 0.8) { n = j; break; }
      if (mag(sub(p, buttonPoint(j + 1, 2.1))) < 0.45) { n = j | 8; break; }
    }
    if (n !== last) { if (last === null) enter = d; else nodes.push([last, (enter + d) / 2]); last = n; }
  }
  if (last === null || nodes.length === 0) throw new Error('Custom slide misses sensors');
  nodes.push([last, length]); nodes[0][1] = 0;
  const result: number[][] = [[0, 0, nodes[0][0], -1]];
  for (let i = 1; i < nodes.length; i++) {
    const [previous, distance] = nodes[i - 1], [next, end] = nodes[i], scale = end - distance;
    const data = AREA_LOOKUP[(previous << 5) | next];
    if (!data) throw new Error('Unsupported sensor transition');
    const tail = result[result.length - 1]; tail[0] = distance + scale * data[0][0]; tail[1] = distance + scale * data[0][1];
    for (const d of data.slice(1)) result.push([distance + scale * d[0], distance + scale * d[1], d[2], d[3]]);
  }
  const lastDistance = path.segments[path.segments.length - 1].center ? 1.75 : nodes[nodes.length - 2][0] <= 7 ? 1.3 : 1.59;
  result[result.length - 2][1] = length - lastDistance;
  return result;
}
function customGeometry(code: string): Geometry {
  const path = parseCustom(code), length = path.length, arrows: Pose[] = [];
  let distance = 0, index = 0;
  const accumulated = path.segments.map((_, i) => path.segments.slice(0, i + 1).reduce((n, s) => n + s.length, 0));
  while (distance < length) {
    const p = path.at(distance);
    if (p.curve && arrows.length) p.angle = arg(sub(p, arrows[arrows.length - 1]));
    arrows.push({ x: p.x, y: p.y, angle: p.angle + Math.PI, length: distance });
    let next = distance + (path.segments[index].step ?? STEP);
    if (index < path.segments.length - 1 && next >= accumulated[index]) {
      if (path.segments[index + 1].marker === 'smooth') {
        const delta = accumulated[index + 1] - distance, step = delta / Math.max(1, Math.round(delta / STEP));
        path.segments[index + 1].step = step; next = distance + step;
      }
      if (path.segments[index].marker === 'force') next = accumulated[index] + (path.segments[index + 1].step ?? STEP);
      index++;
    }
    distance = next;
  }
  const end = path.at(length); arrows.push({ ...end, angle: end.angle + Math.PI });
  const omitLast = length - arrows[arrows.length - 2].length <= STEP / 2;
  const raw = customAreas(path), areas: number[][] = [];
  let arrow = 1, last = 0;
  for (const area of raw.slice(0, -1)) {
    let target = last + 0.33 * (area[0] - last);
    while (arrow < arrows.length - 1 && arrows[arrow].length <= target) arrow++;
    const push = Math.max(arrow - 1, 2); last = area[0]; target = last + 0.33 * (area[1] - last);
    while (arrow < arrows.length - 1 && arrows[arrow].length <= target) arrow++;
    areas.push([push, Math.min(arrow - 1, arrows.length - (omitLast ? 7 : 6)), area[2], area[3]]); last = area[1];
  }
  areas.push([arrows.length, arrows.length, raw[raw.length - 1][2], raw[raw.length - 1][3]]);
  const endButton = Number(code[code.length - 1]), tail = path.segments[path.segments.length - 1];
  let ok: Pose, okType: number;
  if (tail.center) {
    const ccw = tail.sweep! > 0;
    ok = { ...polar(4.62, Math.PI * ((ccw ? 2 : 3) - endButton) / 4), angle: (ccw ? 360 - 45 * endButton : 405 - 45 * endButton) * Math.PI / 180, length: 0 };
    okType = ccw ? 2 : 3;
  } else {
    const left = endButton > 4;
    ok = { ...sub(end, polar(2.05, end.angle)), angle: end.angle + (left ? Math.PI : 0), length: 0 }; okType = left ? 0 : 1;
  }
  return { length, slideConst: 1 - raw[raw.length - 2][1] / length, omitLast, arrows, ok, okType, areas, wifi: false };
}
const decodePose = (p: number[]): Pose => ({ x: p[0], y: p[1], angle: p[2] * Math.PI / 180, length: p[3] });
export function geometryFor(segment: SlideSegment): Geometry {
  let code = segment.code;
  if (segment.type === '^') {
    const diff = (segment.endPos - segment.startPos + 8) % 8;
    if (diff === 0 || diff === 4) throw new Error('Invalid short arc');
    const bottom = segment.startPos >= 3 && segment.startPos <= 6;
    code = `${segment.startPos}${(diff < 4) !== bottom ? '>' : '<'}${segment.endPos}`;
  }
  if (segment.type === 'v' && (segment.endPos - segment.startPos + 8) % 8 === 4) code = `${segment.startPos}-${segment.endPos}`;
  if (segment.type === 'custom') return customGeometry(code);
  const data = SLIDE_TABLE[code];
  if (!data) throw new Error(`Invalid slide geometry: ${code}`);
  return { slideConst: data[0], length: data[1], omitLast: data[2], ok: decodePose(data[3]), okType: data[4], arrows: data[5].map(decodePose), areas: data[6], wifi: segment.type === 'w' };
}
export function prepareBranch(branch: SlideBranch): { geometry: Geometry; startMs: number; durationMs: number }[] {
  const geometries = branch.segments.map(geometryFor), length = geometries.reduce((n, g) => n + g.length, 0);
  let startMs = branch.delayMs;
  return geometries.map((geometry) => {
    // ViewX GetSlidesFromRawContent skips duration brackets, then MakeConnSlide
    // advances over the combined path at constant speed. Keep written durations in the model.
    const durationMs = branch.durationMs * geometry.length / length;
    const result = { geometry, startMs, durationMs }; startMs += durationMs; return result;
  });
}
export function joinGeometries(parts: readonly Geometry[]): Geometry {
  if (parts.length === 1) return parts[0];
  if (!parts.length || parts.some(p => p.wifi)) throw new Error('Invalid connected slide');
  const arrows: Pose[] = [parts[0].arrows[0]], areas: number[][] = [];
  let length = 0, offset = 0;
  for (const part of parts) {
    for (const pose of part.arrows.slice(1, -1)) arrows.push({ ...pose, length: pose.length + length });
    for (const area of part.areas.slice(0, -1)) areas.push([area[0] + offset, area[1] + offset, area[2], area[3]]);
    length += part.length; offset += part.arrows.length - 2;
  }
  const last = parts[parts.length - 1], lastArea = last.areas[last.areas.length - 1];
  arrows.push({ ...last.arrows[last.arrows.length - 1], length });
  areas.push([arrows.length, arrows.length, lastArea[2], lastArea[3]]);
  return { ...last, length, arrows, areas, slideConst: last.slideConst * last.length / length };
}
export function consumedArrows(geometry: Geometry, progress: number): number {
  let index = 1;
  if (geometry.wifi) index = Math.max(1, Math.floor(progress * (geometry.arrows.length - 1)));
  else while (index < geometry.arrows.length - 1 && geometry.arrows[index].length < progress * geometry.length) index++;
  let consumed = 0;
  for (const area of geometry.areas) {
    if (index > area[1]) { consumed = area[1]; continue; }
    if (index > area[0]) consumed = area[0];
    break;
  }
  return consumed;
}
export function pathPose(geometry: Geometry, progress: number): Pose {
  const distance = Math.max(0, Math.min(1, progress)) * geometry.length, poses = geometry.arrows;
  let lo = 1, hi = poses.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (poses[mid].length < distance) lo = mid + 1; else hi = mid; }
  const a = poses[lo - 1], b = poses[lo], t = (distance - a.length) / Math.max(1e-9, b.length - a.length);
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, angle: a.angle + normalAngle(b.angle - a.angle) * t, length: distance };
}
