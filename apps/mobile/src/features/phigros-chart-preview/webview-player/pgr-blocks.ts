/*!
 * PhiVideo field definitions, revision 361e000f5eefc803bdd4ec3c86c402197ea7d30c.
 * MIT License
 *
 * Copyright (c) 2026 たおりん
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
/** 结构来源 phigrostl/PhiVideo Application/BlockArea.h；MIT。 */
import { CHART_PREVIEW_MAX_EVENTS, ChartPreviewBudgetExceededError } from '../../chart-preview-shared/chart-preview-resource-budget';
import { createIntervalIndex } from '../../chart-preview-shared/webview-player/interval-index';
import { upperBoundBy } from '../../chart-preview-shared/webview-player/sorted-search';

type Point = readonly [number, number];
export type PgrBlockKeyframe = { time: number; value: Point; anchor: Point; ease: Point };
export interface PgrBlock {
  bounds: readonly [number, number, number, number];
  appear: number;
  enable: number;
  disable: number;
  disappear: number;
  subtract: boolean;
  move: PgrBlockKeyframe[];
  rotate: PgrBlockKeyframe[];
  scale: PgrBlockKeyframe[];
}
export interface PgrBlockSample {

  /** 归一化坐标，Y 向上，顶点逆时针排列。 */
  corners: readonly [Point, Point, Point, Point];
  opacity: number;
  enabled: boolean;
  subtract: boolean;
}

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : {};
}
function number(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
function point(value: unknown): Point | null {
  const item = object(value);
  const x = number(item.x), y = number(item.y);
  return x === null || y === null ? null : [x, y];
}
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];

/** PGR block 缓动编号与 RPE 不同。 */
export function pgrBlockEase(id: number, progress: number): number {
  const t = Math.max(0, Math.min(1, progress));
  if (id === 13) return 0;
  if (id === 14) return 1;
  if (id === 1) return 1 - Math.cos(t * Math.PI / 2);
  if (id === 2) return Math.sin(t * Math.PI / 2);
  if (id === 3) return (1 - Math.cos(t * Math.PI)) / 2;
  if (Number.isInteger(id) && id >= 4 && id <= 12) {
    const power = Math.floor((id - 4) / 3) + 2;
    const direction = (id - 4) % 3;
    if (direction === 0) return t ** power;
    if (direction === 1) return 1 - (1 - t) ** power;
    return t < 0.5 ? (2 * t) ** power / 2 : 1 - (2 - 2 * t) ** power / 2;
  }
  return t;
}

function keys(source: unknown, kind: 'move' | 'rotate' | 'scale'): PgrBlockKeyframe[] {
  const result: PgrBlockKeyframe[] = [];
  for (const raw of list(source)) {
    const item = object(raw), time = number(item.time);
    const rotation = number(item.rotation);
    const value: Point | null = kind === 'rotate'
      ? rotation === null ? null : [rotation, rotation]
      : point(item[kind === 'move' ? 'endPosition' : 'scale']);
    const anchor = kind === 'move' ? [0, 0] as const : point(item.anchor);
    if (time === null || !value || !anchor) continue;
    result.push({ time, value, anchor, ease: kind === 'rotate'
      ? [number(item.easeType) ?? 0, number(item.easeType) ?? 0]
      : [number(item.easeTypeX) ?? 0, number(item.easeTypeY) ?? 0] });
  }
  return result.sort((a, b) => a.time - b.time);
}

export function parsePgrBlocks(source: unknown): PgrBlock[] {
  const entries = list(source);
  let count = entries.length;
  for (const raw of entries) {
    const item = object(raw);
    count += list(item.moveEvents).length + list(item.rotateEvents).length + list(item.scaleEvents).length;
    if (count > CHART_PREVIEW_MAX_EVENTS) throw new ChartPreviewBudgetExceededError('谱面区域事件超出预算');
  }
  const blocks: PgrBlock[] = [];
  for (const raw of entries) {
    const item = object(raw);
    const a = point(item.bottomLeftPercentage), b = point(item.topRightPercentage);
    const appear = number(item.appearTime), enable = number(item.enableTime);
    const disable = number(item.disableTime), disappear = number(item.disappearTime);
    if (!a || !b || appear === null || enable === null || disable === null || disappear === null) continue;
    blocks.push({ bounds: [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])],
      appear, enable, disable, disappear, subtract: item.isSubtract === true,
      move: keys(item.moveEvents, 'move'), rotate: keys(item.rotateEvents, 'rotate'), scale: keys(item.scaleEvents, 'scale') });
  }
  return blocks;
}

function sample(keys: readonly PgrBlockKeyframe[], time: number, initial: Point): { value: Point; anchor: Point } {
  const index = upperBoundBy(keys, time, key => key.time) - 1;
  if (index < 0) return { value: initial, anchor: [0.5, 0.5] };
  const from = keys[index]!, to = keys[index + 1];
  if (!to) return from;
  const t = (time - from.time) / (to.time - from.time);
  const x = pgrBlockEase(from.ease[0], t), y = pgrBlockEase(from.ease[1], t);
  return { value: [from.value[0] + (to.value[0] - from.value[0]) * x,
    from.value[1] + (to.value[1] - from.value[1]) * y], anchor: from.anchor };
}

export function samplePgrBlock(block: PgrBlock, time: number, aspect: number, enabledOnly = false): PgrBlockSample | null {
  if (!Number.isFinite(time)) return null;
  const enabled = time >= block.enable && time < block.disable;
  let opacity: number;
  if (enabledOnly) {
    if (!enabled) return null;
    opacity = 1;
  } else if (time < block.appear) return null;
  else if (time < block.enable) opacity = (time - block.appear) / (block.enable - block.appear);
  else if (time < block.disable) opacity = 1;
  else if (time < block.disappear) opacity = (block.disappear - time) / (block.disappear - block.disable);
  else return null;
  if (!(opacity > 0)) return null;
  const [left, bottom, right, top] = block.bounds;
  const center: Point = [(left + right) / 2, (bottom + top) / 2];
  const move = sample(block.move, time, center), rotate = sample(block.rotate, time, [0, 0]);
  const scale = sample(block.scale, time, [1, 1]);
  const angle = rotate.value[0] * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle);
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const transform = (x: number, y: number): Point => {
    const sx = scale.anchor[0] + (x - scale.anchor[0]) * scale.value[0];
    const sy = scale.anchor[1] + (y - scale.anchor[1]) * scale.value[1];
    const dx = (sx - rotate.anchor[0]) * safeAspect, dy = sy - rotate.anchor[1];
    const rx = rotate.anchor[0] + (dx * cos - dy * sin) / safeAspect;
    const ry = rotate.anchor[1] + dx * sin + dy * cos;
    return [rx + move.value[0] - center[0], ry + move.value[1] - center[1]];
  };
  return { corners: [transform(left, bottom), transform(right, bottom), transform(right, top), transform(left, top)],
    opacity, enabled, subtract: block.subtract };
}

export function indexPgrBlocks(blocks: readonly PgrBlock[], enabledOnly = false): (time: number) => PgrBlock[] {
  const sorted = [...blocks].sort((a, b) => enabledOnly ? a.enable - b.enable : a.appear - b.appear);
  const query = createIntervalIndex(sorted, block => enabledOnly
    ? [block.enable, block.disable] : [block.appear, Math.max(block.enable, block.disable, block.disappear)]);
  return time => query(time, time);
}
