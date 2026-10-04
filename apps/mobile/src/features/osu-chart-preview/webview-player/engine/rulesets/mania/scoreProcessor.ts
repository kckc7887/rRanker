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
import type { HitResult } from '../../types/index';
import type { ModDifficulty } from '../../utils/modDifficulty';
import type { ComboFrame } from '../../renderer/HUDRenderer';
import type { ManiaHitObject, ManiaHoldNote } from './types';

type SubResults = {
  head?: 305 | 300 | 200 | 100 | 50 | 0;
  tail?: 305 | 300 | 200 | 100 | 50 | 0;
  headTime?: number;
  tailTime?: number;
  bodyBroken: boolean;

  resolveTime: number;
};
/** V1 hold 按 head 误差及 head/tail 绝对误差之和判定；任一 miss 或断 body 则 miss。 */
function combineLN(
  sub: SubResults, hold: ManiaHoldNote, m: ModDifficulty,
): 305 | 300 | 200 | 100 | 50 | 0 {
  if (sub.head === undefined || sub.head === 0) return 0;
  if (sub.tail === undefined || sub.tail === 0) return 0;
  if (sub.bodyBroken) return 0;

  const headErr = Math.abs((sub.headTime ?? hold.startTime) - hold.startTime);
  const tailErr = Math.abs((sub.tailTime ?? hold.endTime) - hold.endTime);
  const combined = headErr + tailErr;

  const Wp = m.maniaHitWindowPerfect, Wg = m.maniaHitWindowGreat;
  const Wgd = m.maniaHitWindowGood, Wok = m.maniaHitWindowOk;
  if (headErr <= Wp * 1.2 && combined <= Wp * 2.4) return 305;
  if (headErr <= Wg * 1.1 && combined <= Wg * 2.2) return 300;
  if (headErr <= Wgd       && combined <= Wgd * 2)  return 200;
  if (headErr <= Wok       && combined <= Wok * 2)  return 100;
  return 50;
}

interface ManiaEvent {
  time: number;
  judgement: 305 | 300 | 200 | 100 | 50 | 0;
}

function combinedV1Events(
  results: readonly HitResult[],
  objects: readonly ManiaHitObject[],
  modDiff: ModDifficulty,
): ManiaEvent[] {
  const holdSub = new Map<number, SubResults>();
  const holdByIndex = new Map<number, ManiaHoldNote>();
  const noteEvents: ManiaEvent[] = [];
  for (const o of objects) if (o.kind === 'hold') holdByIndex.set(o.sourceIndex, o);

  for (const r of results) {
    if (r.subResult === undefined) {
      noteEvents.push({ time: r.time, judgement: r.judgement });
      continue;
    }
    let sub = holdSub.get(r.objectIndex);
    if (sub === undefined) {
      sub = { bodyBroken: false, resolveTime: r.time };
      holdSub.set(r.objectIndex, sub);
    }
    if (r.time > sub.resolveTime) sub.resolveTime = r.time;
    if (r.subResult === 'head') { sub.head = r.judgement; sub.headTime = r.time; }
    else if (r.subResult === 'tail') { sub.tail = r.judgement; sub.tailTime = r.time; }
    else if (r.subResult === 'body' && r.judgement === 0) sub.bodyBroken = true;
  }

  const out: ManiaEvent[] = [...noteEvents];
  for (const [srcIdx, sub] of holdSub) {
    const hold = holdByIndex.get(srcIdx);
    if (hold === undefined) continue;
    const j = combineLN(sub, hold, modDiff);
    out.push({ time: sub.resolveTime, judgement: j });
  }
  out.sort((a, b) => a.time - b.time);
  return out;
}

/** V1 每个 hold 仅增加一次 combo，V2 的 head/tail 各增加一次。 */
export function computeManiaComboTimeline(
  results: readonly HitResult[],
  objects: readonly ManiaHitObject[],
  modDiff: ModDifficulty,
): ComboFrame[] {
  if (modDiff.isLazer) {
    const sorted = [...results].sort((a, b) => a.time - b.time);
    const frames: ComboFrame[] = [];
    let combo = 0;
    for (const r of sorted) {
      if (r.comboIgnore) continue;
      if (r.comboBreak) combo = 0;
      else if (r.judgement > 0) combo += 1;
      frames.push({ time: r.time, combo });
    }
    return frames;
  }
  const events = combinedV1Events(results, objects, modDiff);
  const frames: ComboFrame[] = [];
  let combo = 0;
  for (const ev of events) {
    if (ev.judgement === 0) combo = 0;
    else combo += 1;
    frames.push({ time: ev.time, combo });
  }
  return frames;
}
