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

/** V1 基础分和奖励各占 500k；bonus 值先更新，再开方参与奖励分。 */

/** V1 将 hold 合并为一次计分，V2 分别计算 head/tail，body 只影响 combo。 */

/** V2：150k×comboProgress+850k×Acc^(2+2×Acc)×accProgress+bonus。 */

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

const MOD_FADE_IN = 1 << 20;

/** V1 的 ModMultiplier 缩放分数，ModDivider 缩放 bonus 惩罚。 */

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

export type SubResults = {
  head?: 305 | 300 | 200 | 100 | 50 | 0;
  tail?: 305 | 300 | 200 | 100 | 50 | 0;
  headTime?: number;
  tailTime?: number;
  bodyBroken: boolean;

  resolveTime: number;
};
/** V1 hold 按 head 误差及 head/tail 绝对误差之和判定；任一 miss 或断 body 则 miss。 */
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

/** V1 准确率分母为 300，V2 为 305；两者均排除 hold body。 */
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

    const value = !modDiff.isLazer && r.judgement === 305 ? 300 : r.judgement;
    judgeSum += value;
    objCount++;
    frames.push({ time: r.time, acc: judgeSum / (denomPerHit * objCount) });
  }
  return frames;
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

function computeManiaScoreV1Timeline(
  results: readonly HitResult[],
  objects: readonly ManiaHitObject[],
  modDiff: ModDifficulty,
): ScoreFrame[] {
  const modMult = maniaV1ModMultiplier(modDiff.mods);
  const modDiv  = maniaV1ModDivider(modDiff.mods);

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

/** Perfect 对 combo 基础分贡献 300，对准确率贡献 305。 */

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

  let maxComboPortion = 0;
  let maxAccCount     = 0;
  let cMaxScratch     = 0;

  const pushMax = () => {
    cMaxScratch += 1;
    maxComboPortion += 300 * comboScale(cMaxScratch);
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
  let cGood = 0, cOk = 0, cMeh = 0, cMiss = 0;

  for (const r of results) {

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

      if      (j === 305 || j === 300) {  }
      else if (j === 200) cGood++;
      else if (j === 100) cOk++;
      else if (j === 50)  cMeh++;
      else                cMiss++;
    }
    if (combo > maxCombo) maxCombo = combo;

    const comboProgress = maxComboPortion > 0 ? comboPortion / maxComboPortion : 1;
    /** accProgress 用事件数量比例，不用判定值比例。 */
    const accProgress   = maxAccCount > 0 ? accCount / maxAccCount : 1;

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

export function computeManiaScoreTimeline(
  results: readonly HitResult[],
  objects: readonly ManiaHitObject[],
  modDiff: ModDifficulty,
): ScoreFrame[] {
  return modDiff.isLazer
    ? computeManiaScoreV2Timeline(results, objects, modDiff)
    : computeManiaScoreV1Timeline(results, objects, modDiff);
}
