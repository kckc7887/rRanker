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
import type { TaikoSession, TaikoHit, TaikoDrumRoll, TaikoSwell } from './types';
import type { TaikoAction, TaikoInputEvent } from './input';
import { HIT_TARGET_CANVAS_X, HIT_TARGET_CANVAS_Y } from './Playfield';

export interface TaikoJudgeResult {
  results: HitResult[];
  ghostTaps: TaikoInputEvent[];
}

const STRONG_WINDOW_MS = 30;

function isCentreAction(a: TaikoAction): boolean {
  return a === 'LeftCentre' || a === 'RightCentre';
}

function isLeftAction(a: TaikoAction): boolean {
  return a === 'LeftCentre' || a === 'LeftRim';
}

export function computeTaikoHitResults(
  session: TaikoSession,
  modDiff: ModDifficulty,
): TaikoJudgeResult {
  const { objects, inputEvents } = session;

  const greatW = modDiff.taikoHitWindowGreat;
  const okW    = modDiff.taikoHitWindowOk;
  const missW  = modDiff.taikoHitWindowMiss;

  const hits: TaikoHit[] = [];
  const drumrolls: TaikoDrumRoll[] = [];
  const swells: TaikoSwell[] = [];
  for (const o of objects) {
    if      (o.kind === 'hit')      hits.push(o);
    else if (o.kind === 'drumroll') drumrolls.push(o);
    else                            swells.push(o);
  }

  /** 每次按键只消耗半个 tick 间隔内最近的未消耗 tick。 */

  const tickConsumed = drumrolls.map(() => new Set<number>());

  type SwellState = { lastWasRim: boolean | null; remaining: number; completed: boolean };
  const swellStates: SwellState[] = swells.map(s => ({
    lastWasRim: null,
    remaining: s.requiredHits,
    completed: false,
  }));

  const eventConsumed: boolean[] = new Array(inputEvents.length).fill(false);
  const results: HitResult[] = [];
  const ghostTaps: TaikoInputEvent[] = [];

  function emitAutoMiss(h: TaikoHit): void {
    results.push({
      objectIndex: h.sourceIndex,
      noteId: h.noteId,
      judgement: 0,
      /** 未按音符在 +Ok 窗口后自动 miss。 */

      time: h.time + okW,
      x: HIT_TARGET_CANVAS_X, y: HIT_TARGET_CANVAS_Y,
      hitSound: h.hitSound,
      comboBreak: true,
    });
  }

  let hitIdx = 0;
  /** 一次成功判定会吸收同一回放帧的其它按键；错色 miss 不吸收。 */

  let lastHitTime = Number.NaN;

  for (let i = 0; i < inputEvents.length; i++) {
    if (eventConsumed[i]) continue;
    const ev = inputEvents[i]!;

    if (ev.time === lastHitTime) continue;

    while (hitIdx < hits.length && hits[hitIdx]!.time + okW < ev.time) {
      emitAutoMiss(hits[hitIdx]!);
      hitIdx++;
    }

    if (hitIdx < hits.length) {
      const h = hits[hitIdx]!;
      const delta = ev.time - h.time;
      if (delta >= -missW && delta <= missW) {
        const evCentre = isCentreAction(ev.action);
        const correctColour = evCentre === !h.isRim;
        const absDelta = Math.abs(delta);

        let judgement: 300 | 100 | 0;
        if (!correctColour)         judgement = 0;
        else if (absDelta < greatW) judgement = 300;
        else if (absDelta < okW)    judgement = 100;
        else                        judgement = 0;

        let strong = false;
        let secondHitTime = 0;
        if (h.isStrong && judgement !== 0) {
          for (let j = i + 1; j < inputEvents.length; j++) {
            if (eventConsumed[j]) continue;
            const e2 = inputEvents[j]!;
            if (e2.time - ev.time >= STRONG_WINDOW_MS) break;
            const e2Centre = isCentreAction(e2.action);
            const samePair = e2Centre === evCentre;
            const oppositeSide = isLeftAction(e2.action) !== isLeftAction(ev.action);
            if (samePair && oppositeSide) {
              strong = true;
              secondHitTime = e2.time;
              eventConsumed[j] = true;
              break;
            }
          }
        }

        const result: HitResult = {
          objectIndex: h.sourceIndex,
          noteId: h.noteId,
          judgement,
          time: ev.time,
          x: HIT_TARGET_CANVAS_X, y: HIT_TARGET_CANVAS_Y,
          hitSound: h.hitSound,
          comboBreak: judgement === 0,
        };
        if (strong) {
          result.strong = true;
          result.strongSecondHitTime = secondHitTime;
        }
        results.push(result);

        if (judgement !== 0) lastHitTime = ev.time;
        hitIdx++;
        continue;
      }
    }

    let drMatched = false;
    for (let d = 0; d < drumrolls.length; d++) {
      const dr = drumrolls[d]!;
      if (ev.time < dr.time) break;
      if (ev.time > dr.endTime) continue;

      const consumed = tickConsumed[d]!;
      const halfWin = dr.tickInterval / 2;
      let nearestIdx = -1;
      let nearestDist = Infinity;
      const center = (ev.time - dr.time) / dr.tickInterval;

      for (let t = Math.max(0, Math.floor(center)); t <= Math.min(dr.tickCount - 1, Math.ceil(center)); t++) {
        if (consumed.has(t)) continue;
        const dist = Math.abs(ev.time - (dr.time + t * dr.tickInterval));
        if (dist < nearestDist) { nearestDist = dist; nearestIdx = t; }
      }
      if (nearestIdx >= 0 && nearestDist <= halfWin) {
        consumed.add(nearestIdx);
        results.push({
          objectIndex: dr.sourceIndex,
          judgement: 300,
          time: ev.time,
          x: HIT_TARGET_CANVAS_X, y: HIT_TARGET_CANVAS_Y,
          /** roll/swell 音效按实际按键颜色，忽略物件附加的 finish 音效。 */

          hitSound: isCentreAction(ev.action) ? 0 : 8,
          comboBreak: false,
          comboIgnore: true,
        });
      }
      drMatched = true;
      break;
    }
    if (drMatched) continue;

    let swMatched = false;
    for (let s = 0; s < swells.length; s++) {
      const sw = swells[s]!;
      if (ev.time < sw.time) break;
      if (ev.time > sw.endTime) continue;

      swMatched = true;
      const st = swellStates[s]!;
      if (!st.completed) {
        const evRim = !isCentreAction(ev.action);
        if (st.lastWasRim === null || st.lastWasRim !== evRim) {
          st.lastWasRim = evRim;
          st.remaining--;
          results.push({
            objectIndex: sw.sourceIndex,
            judgement: 300,
            time: ev.time,
            x: HIT_TARGET_CANVAS_X, y: HIT_TARGET_CANVAS_Y,

            hitSound: evRim ? 8 : 0,
            comboBreak: false,
            comboIgnore: true,
          });
          if (st.remaining <= 0) {
            st.completed = true;
            /** strong=true 区分 swell 完成奖励与其单次 tick。 */
            results.push({
              objectIndex: sw.sourceIndex,
              judgement: 300,
              time: ev.time,
              x: HIT_TARGET_CANVAS_X, y: HIT_TARGET_CANVAS_Y,
              hitSound: sw.hitSound,
              comboBreak: false,
              comboIgnore: true,
              strong: true,
            });
          }
        }
      }
      break;
    }
    if (swMatched) continue;

    /** 空按键只播放鼓声，不计分。 */

    ghostTaps.push(ev);
  }

  while (hitIdx < hits.length) {
    emitAutoMiss(hits[hitIdx]!);
    hitIdx++;
  }

  results.sort((a, b) => a.time - b.time);
  return { results, ghostTaps };
}
