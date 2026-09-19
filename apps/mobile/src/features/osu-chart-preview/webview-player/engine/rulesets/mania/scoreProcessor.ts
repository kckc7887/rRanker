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
import { Mod, hasMod } from '../../utils/modDifficulty';
import type { ScoreFrame, Grade } from '../../utils/scoreProcessor';
import type { AccFrame, ComboFrame } from '../../renderer/HUDRenderer';
import type { ManiaHitObject, ManiaHoldNote } from './types';

// Mania scoring.
//
// Stable ScoreV1 (osu-wiki Gameplay/Score/ScoreV1/osu!mania):
//   Score      = BaseScore + BonusScore (summed per-event)
//   BaseScore  = (1_000_000 · ModMult · 0.5 / TotalNotes) · (HitValue / 320)
//   BonusScore = (1_000_000 · ModMult · 0.5 / TotalNotes) · (HitBonusValue · √Bonus / 320)
//   Bonus[t]   = clamp(Bonus[t-1] + HitBonus − HitPunishment / ModDivider, 0, 100); Bonus[0] = 100
// HoldNotes count as ONE event in stable, judged by combined head+tail error capped at GREAT.
// Bodies and tails aren't separate scoring events in V1.
//
// Lazer V2 (ManiaScoreProcessor.cs):
//   Total = 150000 · comboProgress + 850000 · Acc^(2 + 2·Acc) · accProgress + bonus
//   comboPortion += getBaseComboScore(r) · clamp(log4(comboAfter), 0.5, log4(400))
//   getBaseComboScore: Perfect→300 (not 305), Great→300, Good→200, Ok→100, Meh→50, Miss→0
//   GetBaseScoreForResult: Perfect→305, Great→300, …, Miss→0 (used for Accuracy)
//   HoldNote = head + tail (accuracy-affecting, max 305 each) + body (IgnoreHit / ComboBreak)
//
// SS gate (both V1 and V2): SS only if every result is Great or Perfect.

const HIT_VALUE: Record<305 | 300 | 200 | 100 | 50 | 0, number> = {
  305: 320, 300: 300, 200: 200, 100: 100, 50: 50, 0: 0,
};
const HIT_BONUS_VALUE: Record<305 | 300 | 200 | 100 | 50 | 0, number> = {
  305: 32, 300: 32, 200: 16, 100: 8, 50: 4, 0: 0,
};
const HIT_BONUS_ADD: Record<305 | 300 | 200 | 100 | 50 | 0, number> = {
  305: 2, 300: 1, 200: 0, 100: 0, 50: 0, 0: 0,
};
const HIT_PUNISHMENT: Record<305 | 300 | 200 | 100 | 50 | 0, number> = {
  305: 0, 300: 0, 200: 8, 100: 24, 50: 44, 0: Number.POSITIVE_INFINITY,
};

// Mania-specific mod bit (not in the shared Mod enum).
const MOD_FADE_IN = 1 << 20;

// Stable ScoreV1 mania mod factors. ModMultiplier scales BaseScore + BonusScore directly;
// ModDivider scales down the Bonus *punishment* per result. Defaults: mult 1.0, div 1.0.
function maniaV1ModMultiplier(mods: number): number {
  let m = 1;
  if (hasMod(mods, Mod.NoFail))   m *= 0.5;
  if (hasMod(mods, Mod.Easy))     m *= 0.5;
  if (hasMod(mods, Mod.HalfTime)) m *= 0.5;
  return m;
}
function maniaV1ModDivider(mods: number): number {
  let d = 1;
  if (hasMod(mods, Mod.Hidden))     d *= 1.06;
  if (hasMod(mods, Mod.Flashlight)) d *= 1.06;
  if (hasMod(mods, MOD_FADE_IN))    d *= 1.06;
  if (hasMod(mods, Mod.HardRock))   d *= 1.08;
  if (hasMod(mods, Mod.DoubleTime)) d *= 1.10;
  return d;
}

// Lazer V2: per ManiaMod*.cs, almost all mania mods have ScoreMultiplier = 1.0.
// Only key-count mods (xK) are 0.9; native-map replays never carry those (and
// key-count mods are unsupported here), so the V2 mod multiplier is 1.0 across
// the board.
function maniaV2ModMultiplier(_mods: number): number {
  return 1;
}

function manGrade(
  acc: number,
  hasNonGreat: boolean,
  mods: number,
): Grade {
  let g: Grade;
  if      (!hasNonGreat)        g = 'SS';
  else if (acc >= 0.95)         g = 'S';
  else if (acc >= 0.90)         g = 'A';
  else if (acc >= 0.80)         g = 'B';
  else if (acc >= 0.70)         g = 'C';
  else                          g = 'D';
  const silver = (mods & (Mod.Hidden | Mod.Flashlight | MOD_FADE_IN)) !== 0;
  if (silver) {
    if (g === 'S')  return 'SH';
    if (g === 'SS') return 'SSH';
  }
  return g;
}

/**
 * Accumulated head/tail/body sub-results for one HoldNote, collected while
 * walking the flat HitResult stream. Judgement values are the hit-value buckets
 * (305/300/200/100/50/0); times are in beatmap ms. Input to {@link combineLN}.
 */
export type SubResults = {
  head?: 305 | 300 | 200 | 100 | 50 | 0;
  tail?: 305 | 300 | 200 | 100 | 50 | 0;
  headTime?: number;
  tailTime?: number;
  bodyBroken: boolean;
  /** Time the LN's "single judgement" resolves at — the latest of head/tail/body times. */
  resolveTime: number;
};
/**
 * Collapse a HoldNote's head + tail + body sub-results into the single per-LN
 * judgement that stable (ScoreV1) uses (osu! wiki, Gameplay/Judgement/osu!mania).
 * The bucket is derived from BOTH the head timing error and the SUM of head +
 * tail absolute errors, each against the mod-adjusted note windows scaled by
 * stable's LN leniency factors — so LNs CAN reach MAX (305; replays show
 * countGeki exceeding the tap-note count). Head/tail errors are reconstructed
 * from the sub-result times vs the hold's start/end (raw errors are not stored).
 * Miss (0) if either side missed or the body broke.
 */
export function combineLN(
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

/**
 * Walk results, group LN sub-results by sourceIndex, emit one event per scoring object
 * (Note → its judgement; HoldNote → combined head+tail+body).
 */
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

/**
 * Mania accuracy timeline. Excludes HoldNote bodies (non-acc in both V1 and V2).
 * V1: denominator 300 (Perfect and Great both display as 100%, matching stable).
 * V2: denominator 305 (Perfect=305, Great=300/305=98.36%, matching lazer).
 */
export function computeManiaAccTimeline(
  results: readonly HitResult[],
  modDiff: ModDifficulty,
): AccFrame[] {
  const sorted = [...results].sort((a, b) => a.time - b.time);
  const denomPerHit = modDiff.isLazer ? 305 : 300;

  const frames: AccFrame[] = [];
  let judgeSum = 0;
  let objCount = 0;
  for (const r of sorted) {
    if (r.subResult === 'body') continue;
    // V1 treats Perfect as 300 (stable's MAX and GREAT both display 100% acc).
    const value = !modDiff.isLazer && r.judgement === 305 ? 300 : r.judgement;
    judgeSum += value;
    objCount++;
    frames.push({ time: r.time, acc: judgeSum / (denomPerHit * objCount) });
  }
  return frames;
}

/**
 * Mania combo timeline.
 * V2 (lazer): head/tail each +1; body IgnoreHit = no change on success, ComboBreak resets.
 * V1 (stable): one combo event per object — HoldNote = single +1 (hit) or reset (miss/break).
 * The two diverge by 2× per LN, so we don't share the generic computeComboTimeline.
 */
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

function computeManiaScoreV1Timeline(
  results: readonly HitResult[],
  objects: readonly ManiaHitObject[],
  modDiff: ModDifficulty,
): ScoreFrame[] {
  const modMult = maniaV1ModMultiplier(modDiff.mods);
  const modDiv  = maniaV1ModDivider(modDiff.mods);

  // TotalNotes (per stable): one per Note + one per HoldNote.
  const totalNotes = objects.length;
  if (totalNotes === 0) return [];

  const events = combinedV1Events(results, objects, modDiff);
  const perEventScale = (1_000_000 * modMult * 0.5) / totalNotes;

  const frames: ScoreFrame[] = [];
  let score = 0;
  let combo = 0, maxCombo = 0;
  let bonus = 100;
  let cPerfect = 0, cGreat = 0, cGood = 0, cOk = 0, cMeh = 0, cMiss = 0;

  for (const ev of events) {
    const j = ev.judgement;

    if (j === 0) {
      combo = 0;
    } else {
      combo += 1;
    }
    if (combo > maxCombo) maxCombo = combo;

    // Update bonus *before* using it (stable: Bonus starts at 100, decremented/incremented
    // each result before its sqrt is read for BonusScore — empirically matches stable score
    // totals within rounding).
    if (j === 0) bonus = 0;
    else bonus = Math.max(0, Math.min(100, bonus + HIT_BONUS_ADD[j] - HIT_PUNISHMENT[j] / modDiv));

    const base = perEventScale * (HIT_VALUE[j] / 320);
    const bon  = perEventScale * (HIT_BONUS_VALUE[j] * Math.sqrt(bonus) / 320);
    score += base + bon;

    if      (j === 305) cPerfect++;
    else if (j === 300) cGreat++;
    else if (j === 200) cGood++;
    else if (j === 100) cOk++;
    else if (j === 50)  cMeh++;
    else                cMiss++;

    const accSum   = 300 * cPerfect + 300 * cGreat + 200 * cGood + 100 * cOk + 50 * cMeh;
    const accCount = cPerfect + cGreat + cGood + cOk + cMeh + cMiss;
    const acc      = accCount > 0 ? accSum / (300 * accCount) : 1;
    const hasNonGreat = (cGood + cOk + cMeh + cMiss) > 0;
    const grade = manGrade(acc, hasNonGreat, modDiff.mods);

    frames.push({
      time: ev.time, score: Math.round(score), combo, maxCombo, grade,
    });
  }

  return frames;
}

// Per-result combo-base score (lazer getBaseComboScoreForResult). Perfect contributes 300
// to combo portion but 305 to accuracy portion — that's the whole reason the override exists.
function comboBase(j: 305 | 300 | 200 | 100 | 50 | 0): number {
  switch (j) {
    case 305: return 300;
    case 300: return 300;
    case 200: return 200;
    case 100: return 100;
    case 50:  return 50;
    case 0:   return 0;
  }
}
const COMBO_BASE = 4;
function comboScale(comboAfter: number): number {
  if (comboAfter <= 0) return 0.5;
  const log = Math.log(comboAfter) / Math.log(COMBO_BASE);
  const maxLog = Math.log(400) / Math.log(COMBO_BASE);
  return Math.min(Math.max(0.5, log), maxLog);
}

function computeManiaScoreV2Timeline(
  results: readonly HitResult[],
  objects: readonly ManiaHitObject[],
  modDiff: ModDifficulty,
): ScoreFrame[] {
  const modMult = maniaV2ModMultiplier(modDiff.mods);

  // Perfect-play prepass: max comboPortion and max accPortion.
  // Note: 1 acc event; HoldNote: head + tail = 2 acc events. Body excluded (IgnoreHit).
  let maxComboPortion = 0;
  let maxAccPortion   = 0;
  let maxAccCount     = 0;
  let cMaxScratch     = 0;

  const pushMax = () => {
    cMaxScratch += 1;
    maxComboPortion += 300 * comboScale(cMaxScratch);   // Perfect's combo-base = 300
    maxAccPortion   += 305;
    maxAccCount     += 1;
  };
  for (const o of objects) {
    if (o.kind === 'note') pushMax();
    else { pushMax(); pushMax(); }
  }

  const frames: ScoreFrame[] = [];
  let combo = 0, maxCombo = 0;
  let comboPortion = 0;
  let accSum       = 0;
  let accCount     = 0;
  let cPerfect = 0, cGreat = 0, cGood = 0, cOk = 0, cMeh = 0, cMiss = 0;

  for (const r of results) {
    // Body (lazer V2): ComboBreak (j=0) resets combo and falls through to emit a frame;
    // success is IgnoreHit — no acc/combo contribution, skip silently.
    if (r.subResult === 'body') {
      if (r.judgement === 0) combo = 0;
      else continue;
    } else {
      const j = r.judgement;
      if (r.comboBreak || j === 0) {
        combo = 0;
      } else {
        combo += 1;
        comboPortion += comboBase(j) * comboScale(combo);
      }

      accSum   += j;
      accCount += 1;

      if      (j === 305) cPerfect++;
      else if (j === 300) cGreat++;
      else if (j === 200) cGood++;
      else if (j === 100) cOk++;
      else if (j === 50)  cMeh++;
      else                cMiss++;
    }
    if (combo > maxCombo) maxCombo = combo;

    const comboProgress = maxComboPortion > 0 ? comboPortion / maxComboPortion : 1;
    // accProgress is a count ratio, not a value ratio (ScoreProcessor.cs:updateScore).
    const accProgress   = maxAccCount > 0 ? accCount / maxAccCount : 1;
    // Displayed Accuracy = currentBaseScore / currentMaximumBaseScore (ScoreProcessor.Accuracy).
    const displayAcc    = accCount > 0 ? accSum / (305 * accCount) : 1;
    const inner         = 150000 * comboProgress
                        + 850000 * Math.pow(displayAcc, 2 + 2 * displayAcc) * accProgress;
    const score         = Math.round(Math.round(inner) * modMult);

    const hasNonGreat = (cGood + cOk + cMeh + cMiss) > 0;
    const grade = manGrade(displayAcc, hasNonGreat, modDiff.mods);
    frames.push({ time: r.time, score, combo, maxCombo, grade });
  }
  return frames;
}

/**
 * Score timeline for the HUD: one frame (time, score, combo, maxCombo, grade)
 * per scoring event. Uses lazer's ScoreV2 formula when `modDiff.isLazer`, else
 * stable's mania ScoreV1 (see the formulas at the top of this module).
 */
export function computeManiaScoreTimeline(
  results: readonly HitResult[],
  objects: readonly ManiaHitObject[],
  modDiff: ModDifficulty,
): ScoreFrame[] {
  return modDiff.isLazer
    ? computeManiaScoreV2Timeline(results, objects, modDiff)
    : computeManiaScoreV1Timeline(results, objects, modDiff);
}
