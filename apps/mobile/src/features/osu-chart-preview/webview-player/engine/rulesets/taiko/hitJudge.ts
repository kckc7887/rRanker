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

/**
 * Per-press taiko judgement.
 *
 * Invariant relied on by computeTaikoURTimeline: emits exactly one
 * non-comboIgnore result per TaikoHit (real press OR auto-miss), pushed in
 * source order. The final time-sort preserves that relative order because
 * auto-miss times (h.time + missW) are monotonic in source order.
 *
 * Also returns ghostTaps: presses that interacted with NO object — no Hit
 * within the miss window and outside every drum-roll/swell span. These carry
 * no judgement (they don't touch score/acc/combo); AudioSync plays a bare
 * don/kat for them so empty-section taps and warm-up taps are audible, the way
 * stable's drum sounds on any key press.
 */

/** Output of {@link computeTaikoHitResults}: time-sorted judgements plus unmatched presses. */
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

/**
 * Judge every input event against the session's converted objects, mirroring
 * lazer's per-press taiko rules (colour check, strong pairing, drum-roll tick
 * consumption, swell alternation, auto-miss expiry). Hit windows come from the
 * mod-adjusted `modDiff.taikoHitWindow*` values; times are milliseconds.
 */
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

  // Tick window = tickInterval/2 enforces the mash-speed cap (a press can only
  // consume the nearest unconsumed tick within half a tick interval).
  const tickConsumed: boolean[][] = drumrolls.map(d => new Array(d.tickTimes.length).fill(false));

  // lastWasRim=null → no press yet; either colour can start.
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
      // An unpressed note auto-misses at the lowest *successful* window (Ok), not Miss
      // — lazer's `HitWindows.CanBeHit(timeOffset)` is `timeOffset <= WindowFor(Ok)`,
      // so the note expires once the clock passes time + okW. See the okW drain below.
      time: h.time + okW,
      x: HIT_TARGET_CANVAS_X, y: HIT_TARGET_CANVAS_Y,
      hitSound: h.hitSound,
      comboBreak: true,
    });
  }

  let hitIdx = 0;
  // Time of the last press that resolved a Hit. lazer's DrawableHit.OnPressed sets
  // `pressHandledThisFrame` when a press HITS (not on a wrong-colour miss): the hit
  // note — drawn on top, so first in the input queue — then absorbs any *other* press
  // in the same frame, returning before it can reach the next note. So a simultaneous
  // don+kat double can't pick off two adjacent notes; the second press is discarded.
  // Replay frames emit all their presses at one cumulative (integer-ms) time, so a
  // shared ev.time identifies one frame. Only a successful Hit blocks; a wrong-colour
  // miss leaves the frame open (it consumes its own note, then propagation continues).
  let lastHitTime = Number.NaN;

  for (let i = 0; i < inputEvents.length; i++) {
    if (eventConsumed[i]) continue;
    const ev = inputEvents[i]!;

    // Absorbed: a Hit already resolved at this frame-time (see lastHitTime above).
    if (ev.time === lastHitTime) continue;

    // Drain unpressed notes that lazer has already auto-missed. The expiry boundary
    // is the Ok (lowest successful) window, NOT Miss: lazer one-sidedly auto-misses an
    // un-hit note once `time + okW < now` (CanBeHit → false). Using missW here keeps a
    // stale note alive ~18 ms too long, so a late press gets greedily mis-assigned to
    // it (Miss) instead of falling through to the next note (which lazer hits) —
    // cascading a whole dense stream a note out of phase. A press can still CONSUME a
    // note as a Miss out to ±missW below (early side); that path is unchanged.
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

        // Strong second-key only counts if the first key was a successful hit.
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
        // A successful Hit (not a wrong-colour/late miss) arms frame absorption.
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
      for (let t = 0; t < dr.tickTimes.length; t++) {
        if (consumed[t]) continue;
        const dist = Math.abs(ev.time - dr.tickTimes[t]!);
        if (dist < nearestDist) { nearestDist = dist; nearestIdx = t; }
      }
      if (nearestIdx >= 0 && nearestDist <= halfWin) {
        consumed[nearestIdx] = true;
        results.push({
          objectIndex: dr.sourceIndex,
          judgement: 300,
          time: ev.time,
          x: HIT_TARGET_CANVAS_X, y: HIT_TARGET_CANVAS_Y,
          // A tick plays don/kat by the pressed key, never the drumroll's own
          // additions (a finish-tagged roll must not play finish on every tick).
          // centre → normal(0), rim → clap(8). AudioSync reads this hitSound.
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
            // Same as drumroll ticks: ignore the spinner's additions (incl. finish)
            // and play don/kat by the pressed key. rim → clap(8), centre → normal(0).
            hitSound: evRim ? 8 : 0,
            comboBreak: false,
            comboIgnore: true,
          });
          if (st.remaining <= 0) {
            st.completed = true;
            // LargeBonus completion: strong:true distinguishes it from a per-tick result on the same objectIndex.
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

    // Nothing to interact with at this press: no Hit in window, no active
    // drum-roll, no active swell. It's a ghost tap — audible in stable, scored
    // nowhere.
    ghostTaps.push(ev);
  }

  while (hitIdx < hits.length) {
    emitAutoMiss(hits[hitIdx]!);
    hitIdx++;
  }

  results.sort((a, b) => a.time - b.time);
  return { results, ghostTaps };
}
