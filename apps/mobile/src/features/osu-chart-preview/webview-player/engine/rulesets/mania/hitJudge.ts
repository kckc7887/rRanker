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

// Per-press mania judgement + HoldNote state machine. Ports lazer's (ppy/osu)
// ManiaHitWindows, DrawableNote.CheckForResult, DrawableHoldNote (head/tail/body
// with the Meh cap on broken holds), and OrderedHitPolicy.
//
// One result per Note (judgement only), three results per HoldNote (subResult='head'|'tail'|'body').
// Body subResult carries 300 (hit) / 0 (broken) — score weighting is applied by the score processor.
// Positions (x, y) are left at 0 here; popup placement is derived from the layout at draw time.

// TailNote.cs RELEASE_WINDOW_LENIENCE — widens the release window (timeOffset/1.5).
const RELEASE_LENIENCE = 1.5;

/** Judgement-derived lifecycle of one HoldNote, keyed by its sourceIndex in the session. */
export interface ManiaHoldState {
  /** Head judgement (0 = missed or auto-missed). */
  headJudgement: 305 | 300 | 200 | 100 | 50 | 0;
  /** When the user pressed the head. null if head was auto-missed (no press in window). */
  pressedAt: number | null;
  /** When the user released. null if the user held through end-of-song / never released. */
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

/**
 * Judge every object in the session against the decoded input events, per column.
 * Returns time-sorted HitResults (one per tap note; head/tail/body sub-results per
 * hold) plus a per-hold state map for rendering. Pure function of the session's
 * objects/inputEvents and the mod-adjusted hit windows in `modDiff` (all ms).
 */
export function computeManiaHitResults(
  session: ManiaSession,
  modDiff: ModDifficulty,
): { results: HitResult[]; holdStates: Map<number, ManiaHoldState> } {
  const { objects, inputEvents, totalColumns } = session;
  const missW  = modDiff.maniaHitWindowMiss;
  const mehW   = modDiff.maniaHitWindowMeh;
  // Two different boundaries:
  //   • UNPRESSED auto-miss fires at +Meh (lowest successful window). lazer's
  //     CanBeHit is one-sided (`timeOffset <= MehWindow`), so a note that never
  //     gets a press is missed once the clock passes objTime + Meh — NOT the wider
  //     Miss window.
  //   • A PRESS can still consume the next note down to objTime − Miss: lazer's
  //     ResultFor walks Perfect…Miss, so an early press 191–247 ms ahead of a note
  //     registers a Miss on it (the negative-offset force-misses seen in dense
  //     rolls), while a press > Miss early is ignored (ResultFor → None). The late
  //     side is already bounded by the +Meh auto-miss above.
  // Tails reuse the 1.5× release lenience on the auto-miss (Meh) boundary.
  const tailMissW = mehW * RELEASE_LENIENCE;

  // Per-column buckets — ordered by time (the global lists are too).
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
    // True once the held LN has been dropped (released before the tail window) — the
    // body is broken, but the tail stays unjudged so a re-grip + in-window release can
    // still score it (lazer: an out-of-window release drops the hold without consuming
    // the tail). Reset whenever a new head is pressed.
    let pendingDropped = false;

    const startTimeOf = (o: ManiaHitObject): number => o.kind === 'note' ? o.time : o.startTime;

    // Miss an unhit object (window expired, or locked out by OrderedHitPolicy). A note
    // emits one Miss; a never-held LN still resolves all three sub-results — head Miss,
    // body break, tail Miss — because lazer judges them as the LN scrolls past, and the
    // tail is accuracy-affecting (V2's prepass expects head+tail per LN). `time` is only
    // the result's anchor for score/combo ordering; the diff keys by the object's own
    // start/end. (A head consumed by an early press-miss instead flows through the press
    // path, which sets `pending` so a later release judges the tail.)
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

    // Resolve the current held LN's tail+body as a Miss/break and clear it. Used both
    // when the tail's release window lapses (drain) and when OrderedHitPolicy force-misses
    // it (a hit on the next object in the column).
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
        // OrderedHitPolicy.IsHittable: a note is hittable only while `time < nextNote.start`.
        // Once the next note in the column has started, the earlier one is locked out — a
        // press skips (and force-misses) it and lands on the first still-hittable note.
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
        if (delta < -missW) continue; // > Miss-window early — ResultFor → None, press wasted.

        const j = judgementFor(Math.abs(delta), modDiff);

        // OrderedHitPolicy.HandleHit: a hit on the next object in the column force-misses
        // an earlier hold's still-unresolved tail (the LN was dropped before its tail
        // window, leaving the tail pending). Same-column objects never overlap, so a
        // pending tail's endTime always precedes this object.
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
      } else { // release
        if (pending === null) continue;

        const rawTailDelta = ev.time - pending.endTime;
        const effOffset = rawTailDelta / RELEASE_LENIENCE;
        const absEff = Math.abs(effOffset);

        // Release before the tail is even hittable (effective offset past the Miss
        // window): lazer's TailNote.ResultFor returns None, so the tail is NOT consumed
        // — only the body drops. Keep `pending` so a later in-window release scores the
        // tail (and is Meh-capped by the drop). Mirrors a re-grip after an early let-go.
        if (effOffset < -missW) {
          pendingDropped = true;
          continue;
        }

        let tailJ = judgementFor(absEff, modDiff);

        const st = holdStates.get(pending.sourceIndex);
        // Body broken iff the LN was dropped earlier, or this release is early enough that
        // the effective offset escapes the Meh window (lazer: releasing before the tail
        // window registers a hold-break on the body).
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
        // Lazer body = IgnoreHit on success (no acc/combo contribution) / ComboBreak on
        // early release (combo reset, no acc). Mark success with comboIgnore so the shared
        // comboTimeline doesn't double-count head/tail/body for one LN.
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
