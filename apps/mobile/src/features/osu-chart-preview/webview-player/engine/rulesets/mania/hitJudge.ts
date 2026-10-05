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
import type { ManiaSession, ManiaHoldNote, ManiaHitObject } from './types';
import type { ManiaInputEvent } from './input';

/** 参考 ppy/osu ManiaHitWindows、DrawableHoldNote 与 OrderedHitPolicy。 */

const RELEASE_LENIENCE = 1.5;

export interface ManiaHoldState {

  headJudgement: 305 | 300 | 200 | 100 | 50 | 0;

  pressedAt: number | null;

  releasedAt: number | null;
}

function judgementFor(
  absDelta: number,
  m: ModDifficulty,
): 305 | 300 | 200 | 100 | 50 | 0 {
  if (absDelta <= m.maniaHitWindowPerfect) return 305;
  if (absDelta <= m.maniaHitWindowGreat)   return 300;
  if (absDelta <= m.maniaHitWindowGood)    return 200;
  if (absDelta <= m.maniaHitWindowOk)      return 100;
  if (absDelta <= m.maniaHitWindowMeh)     return 50;
  return 0;
}

export function computeManiaHitResults(
  session: ManiaSession,
  modDiff: ModDifficulty,
): { results: HitResult[]; holdStates: Map<number, ManiaHoldState> } {
  const { objects, inputEvents, totalColumns } = session;
  const missW  = modDiff.maniaHitWindowMiss;
  const mehW   = modDiff.maniaHitWindowMeh;
  /** 未按音符在 +Meh 自动 miss；提前按键仍可在 −Miss 窗口内消耗音符。 */

  const tailMissW = mehW * RELEASE_LENIENCE;

  const objsByCol: ManiaHitObject[][] = Array.from({ length: totalColumns }, () => []);
  for (const o of objects) {
    const col = objsByCol[o.column];
    if (col !== undefined) col.push(o);
  }
  const eventsByCol: ManiaInputEvent[][] = Array.from({ length: totalColumns }, () => []);
  for (const e of inputEvents) {
    const col = eventsByCol[e.column];
    if (col !== undefined) col.push(e);
  }

  const results: HitResult[] = [];
  const holdStates = new Map<number, ManiaHoldState>();

  for (let c = 0; c < totalColumns; c++) {
    const objs = objsByCol[c]!;
    const evs  = eventsByCol[c]!;

    let oi = 0;
    let pending: ManiaHoldNote | null = null;
    /** 提前松键仅断 body，仍可重新按住并在窗口内判定 tail。 */

    let pendingDropped = false;

    const startTimeOf = (o: ManiaHitObject): number => o.kind === 'note' ? o.time : o.startTime;

    const missObject = (o: ManiaHitObject, time: number): void => {
      if (o.kind === 'note') {
        results.push({
          objectIndex: o.sourceIndex, judgement: 0,
          time, x: 0, y: 0,
          hitSound: o.hitSound, comboBreak: true,
        });
        return;
      }
      results.push({
        objectIndex: o.sourceIndex, judgement: 0, subResult: 'head',
        time, x: 0, y: 0,
        hitSound: o.hitSound, comboBreak: true,
      });
      results.push({
        objectIndex: o.sourceIndex, judgement: 0, subResult: 'body',
        time: o.endTime, x: 0, y: 0,
        hitSound: 0, comboBreak: true,
      });
      results.push({
        objectIndex: o.sourceIndex, judgement: 0, subResult: 'tail',
        time: o.endTime + tailMissW, x: 0, y: 0,
        hitSound: o.hitSound, comboBreak: true,
      });
      holdStates.set(o.sourceIndex, { headJudgement: 0, pressedAt: null, releasedAt: null });
    };

    const drainExpiredHeads = (cursor: number): void => {
      while (oi < objs.length) {
        const o = objs[oi]!;
        const headTime = startTimeOf(o);
        if (headTime + mehW >= cursor) break;
        missObject(o, headTime + mehW);
        oi++;
      }
    };

    const missPendingTail = (time: number): void => {
      if (pending === null) return;
      results.push({
        objectIndex: pending.sourceIndex, judgement: 0, subResult: 'tail',
        time, x: 0, y: 0,
        hitSound: pending.hitSound, comboBreak: true,
      });
      results.push({
        objectIndex: pending.sourceIndex, judgement: 0, subResult: 'body',
        time: pending.endTime, x: 0, y: 0,
        hitSound: 0, comboBreak: true,
      });
      pending = null;
    };

    const drainExpiredTail = (cursor: number): void => {
      if (pending === null) return;
      const tailMissAt = pending.endTime + tailMissW;
      if (tailMissAt >= cursor) return;
      missPendingTail(tailMissAt);
    };

    for (const ev of evs) {
      drainExpiredHeads(ev.time);
      drainExpiredTail(ev.time);

      if (ev.kind === 'press') {
        /** 同列下一音符开始后，前一音符被锁定并强制 miss。 */

        while (oi < objs.length) {
          const next = objs[oi + 1];
          if (next === undefined || ev.time < startTimeOf(next)) break;
          missObject(objs[oi]!, ev.time);
          oi++;
        }
        if (oi >= objs.length) continue;
        const o = objs[oi]!;
        const headTime = startTimeOf(o);
        const delta = ev.time - headTime;
        if (delta < -missW) continue;

        const j = judgementFor(Math.abs(delta), modDiff);

        if (j > 0 && pending !== null && pending.endTime <= headTime) missPendingTail(ev.time);

        if (o.kind === 'note') {
          results.push({
            objectIndex: o.sourceIndex, judgement: j,
            time: ev.time, x: 0, y: 0,
            hitSound: o.hitSound, comboBreak: j === 0,
          });
          oi++;
        } else {
          results.push({
            objectIndex: o.sourceIndex, judgement: j, subResult: 'head',
            time: ev.time, x: 0, y: 0,
            hitSound: o.hitSound, comboBreak: j === 0,
          });
          holdStates.set(o.sourceIndex, {
            headJudgement: j,
            pressedAt: ev.time,
            releasedAt: null,
          });
          pending = o;
          pendingDropped = false;
          oi++;
        }
      } else {
        if (pending === null) continue;

        const rawTailDelta = ev.time - pending.endTime;
        const effOffset = rawTailDelta / RELEASE_LENIENCE;
        const absEff = Math.abs(effOffset);

        /** 在 tail 窗口前松键只断 body，不消耗 tail 判定。 */

        if (effOffset < -missW) {
          pendingDropped = true;
          continue;
        }

        let tailJ = judgementFor(absEff, modDiff);

        const st = holdStates.get(pending.sourceIndex);

        const bodyBroken = pendingDropped || (rawTailDelta < 0 && absEff > mehW);
        const headMissed = (st?.headJudgement ?? 0) === 0;
        const hasComboBreak = headMissed || bodyBroken;
        if (hasComboBreak && tailJ > 50) tailJ = 50;

        const bodyJ: 300 | 0 = bodyBroken ? 0 : 300;

        results.push({
          objectIndex: pending.sourceIndex, judgement: tailJ, subResult: 'tail',
          time: ev.time, x: 0, y: 0,
          hitSound: pending.hitSound, comboBreak: tailJ === 0,
        });
        /** body 成功不计准确率或 combo；断 body 重置 combo。 */

        results.push({
          objectIndex: pending.sourceIndex, judgement: bodyJ, subResult: 'body',
          time: ev.time, x: 0, y: 0,
          hitSound: 0, comboBreak: bodyJ === 0,
          ...(bodyJ === 300 ? { comboIgnore: true } : {}),
        });

        if (st !== undefined) {
          st.releasedAt = ev.time;
        }
        pending = null;
      }
    }

    drainExpiredHeads(Number.POSITIVE_INFINITY);
    drainExpiredTail(Number.POSITIVE_INFINITY);
  }

  results.sort((a, b) => a.time - b.time);
  return { results, holdStates };
}
