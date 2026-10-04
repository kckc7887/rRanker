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
import type { BeatmapData } from '../../types/index';
import type { ModDifficulty } from '../../utils/modDifficulty';
import type { ScoreFrame, Grade } from '../../utils/scoreProcessor';
import { computeModMultiplier, computeTaikoModMultiplierV2 } from '../../utils/scoreProcessor';
import { slideDurationMs } from '../../utils/sliderDuration';
import type { TaikoSession, TaikoHitObject } from './types';

/** V1 显示分数=准确率分+奖励分+round(combo 分×Mod 倍率)。 */

const KIAI_F32 = Math.fround(1.2);
/** 乘法按 float32，再向零截断。 */
function applyKiai(x: number): number {
  return Math.trunc(Math.fround(x * KIAI_F32));
}

/** C# Math.Round 的中点采用向偶数舍入。 */
function roundToEven(x: number): number {
  const floor = Math.floor(x);
  const diff  = x - floor;
  if (diff < 0.5) return floor;
  if (diff > 0.5) return floor + 1;
  return floor % 2 === 0 ? floor : floor + 1;
}

function activeKiaiAt(beatmap: BeatmapData, time: number): boolean {
  let kiai = false;
  for (const tp of beatmap.timingPoints) {
    if (tp.time > time) break;
    kiai = tp.kiai;
  }
  return kiai;
}

function computeTaikoGrade(
  c300: number, c100: number, miss: number, mods: number,
): Grade {
  const total = c300 + c100 + miss;
  if (total === 0) return 'D';

  const r300 = c300 / total;
  const r100 = c100 / total;

  let g: Grade;
  if      (c300 === total)                                     g = 'SS';
  else if (r300 > 0.9 && r100 < 0.01 && miss === 0)            g = 'S';
  else if ((r300 > 0.8 && miss === 0) || r300 > 0.9)           g = 'A';
  else if ((r300 > 0.7 && miss === 0) || r300 > 0.8)           g = 'B';
  else if (r300 > 0.6)                                         g = 'C';
  else                                                         g = 'D';

  const silver = (mods & ((1 << 3) | (1 << 10))) !== 0;
  if (silver) {
    if (g === 'S')  return 'SH';
    if (g === 'SS') return 'SSH';
  }
  return g;
}

/** peppyStars 按未加 Mod 的 HP/OD/CS 和密度计算，向偶数舍入后加 1，限制为 2..7。 */
export interface PeppyStarsBreakdown {
  hp: number; od: number; cs: number;
  objectCount: number; drainSec: number; density: number;
  sum: number; raw: number;
  peppyStars: number; peppyStarsPlusOne: number;
}

export function taikoPeppyStarsBreakdown(beatmap: BeatmapData): PeppyStarsBreakdown {
  const hos = beatmap.hitObjects;
  const hp = beatmap.hpDrainRate;
  const od = beatmap.overallDifficulty;
  const cs = beatmap.circleSize;

  let drainSec = 1;
  if (hos.length > 0) {
    const first = hos[0]!.time;
    let lastEnd = first;
    for (const o of hos) {
      let end = o.time;
      if      (o.type === 'spinner') end = o.endTime;
      else if (o.type === 'slider')  end = o.time + slideDurationMs(beatmap, o) * o.slides;
      if (end > lastEnd) lastEnd = end;
    }

    drainSec = Math.max(1, Math.round((lastEnd - first) / 1000));
  }

  const objectCount = hos.length;
  const fr = Math.fround;
  const density = Math.min(16, Math.max(0, fr(fr(objectCount / drainSec) * 8)));

  const sum = fr(hp) + fr(od) + fr(cs) + density;
  const raw = fr(fr(sum / 38) * 5);
  const peppyStars = roundToEven(raw);
  const peppyStarsPlusOne = Math.max(2, Math.min(7, peppyStars + 1));

  return { hp, od, cs, objectCount, drainSec, density, sum, raw, peppyStars, peppyStarsPlusOne };
}

export function taikoScoreMultiplier(beatmap: BeatmapData): number {
  return 16 * taikoPeppyStarsBreakdown(beatmap).peppyStarsPlusOne;
}

export function computeTaikoScoreV1Timeline(
  session: TaikoSession,
  modDiff: ModDifficulty,
): ScoreFrame[] {
  const { beatmap, objects, hitResults } = session;

  const modMult = computeModMultiplier(modDiff.mods);
  const peppyStarsPlusOne = taikoPeppyStarsBreakdown(beatmap).peppyStarsPlusOne;

  const objBySrc = new Map<number, TaikoHitObject>();
  for (const o of objects) {
    if (o.kind === 'drumroll' || o.kind === 'swell') {
      objBySrc.set(o.sourceIndex, o);
    }
  }

  const sorted = [...hitResults].sort((a, b) => a.time - b.time);

  let accuracyScore = 0;
  let comboScore    = 0;
  let bonusScore    = 0;

  const frames: ScoreFrame[] = [];
  let combo = 0, maxCombo = 0;
  let c300 = 0, c100 = 0, miss = 0;

  for (const r of sorted) {
    if (r.comboIgnore) {
      const obj = objBySrc.get(r.objectIndex);

      if (r.strong === true) {
        /** swell 完成的 kiai 状态取 EndTime，roll tick 则取 roll StartTime。 */
        const swellEnd = obj?.kind === 'swell' ? obj.endTime : r.time;
        const kiai = activeKiaiAt(beatmap, swellEnd);
        const base = 300;
        const comboTerm = Math.min(Math.floor(Math.min(100, combo) / 10), 10);
        const comboBonusRaw = Math.trunc(base / 35) * 2 * peppyStarsPlusOne * comboTerm;
        let scoreIncrease = base + comboBonusRaw;
        if (kiai) scoreIncrease = applyKiai(scoreIncrease);
        let comboScoreIncrease = scoreIncrease - base;
        scoreIncrease       *= 2;
        comboScoreIncrease  *= 2;
        bonusScore += scoreIncrease - comboScoreIncrease;
        comboScore += comboScoreIncrease;
      } else if (obj?.kind === 'drumroll') {

        const kiai = activeKiaiAt(beatmap, obj.time);
        let inc = 300;
        if (kiai) inc = applyKiai(inc);
        if (obj.isStrong) inc += Math.trunc(inc / 5);
        bonusScore += inc;
      } else {
        /** swell tick 沿用 stable 运行时的 kiai 加分。 */

        const kiai = activeKiaiAt(beatmap, r.time);
        let inc = 300;
        if (kiai) inc = applyKiai(inc);
        bonusScore += inc;
      }

      const score = accuracyScore + bonusScore + Math.round(comboScore * modMult);
      const grade = computeTaikoGrade(c300, c100, miss, modDiff.mods);
      frames.push({ time: r.time, score, combo, maxCombo, grade });
      continue;
    }

    if (r.judgement === 0) {
      combo = 0;
      miss++;
    } else {
      combo += 1;
      if (combo > maxCombo) maxCombo = combo;
      if (r.judgement === 300) c300++;
      else                     c100++;
    }

    if (r.judgement > 0) {
      const base = r.judgement;

      const comboBefore = Math.max(combo - 1, 0);
      const comboTerm   = Math.min(Math.floor(comboBefore / 10), 10);
      const comboBonusRaw = Math.trunc(base / 35) * 2 * peppyStarsPlusOne * comboTerm;

      const kiai = activeKiaiAt(beatmap, r.time);
      let scoreIncrease = base + comboBonusRaw;
      if (kiai) scoreIncrease = applyKiai(scoreIncrease);
      let comboScoreIncrease = scoreIncrease - base;
      if (r.strong === true) {
        scoreIncrease      *= 2;
        comboScoreIncrease *= 2;
      }
      accuracyScore += scoreIncrease - comboScoreIncrease;
      comboScore    += comboScoreIncrease;
    }

    const score = accuracyScore + bonusScore + Math.round(comboScore * modMult);
    const grade = computeTaikoGrade(c300, c100, miss, modDiff.mods);
    frames.push({ time: r.time, score, combo, maxCombo, grade });
  }

  return frames;
}

/** V2=round(round(250k×comboProgress+750k×Acc^3.6×accProgress+bonus)×Mod)。 */

const LOG4 = Math.log(4);
const LOG4_400 = Math.log(400) / LOG4;
const LOG4_MIN = 0.5;

function taikoComboFactor(combo: number): number {
  if (combo <= 0) return LOG4_MIN;
  const l = Math.log(combo) / LOG4;
  return Math.min(LOG4_400, Math.max(LOG4_MIN, l));
}

function computeTaikoLazerGrade(accuracy: number, miss: number, mods: number): Grade {
  let g: Grade;
  if      (accuracy >= 1.0 && miss === 0)        g = 'SS';
  else if (accuracy >= 0.95 && miss === 0)       g = 'S';
  else if (accuracy >= 0.90)                     g = 'A';
  else if (accuracy >= 0.80)                     g = 'B';
  else if (accuracy >= 0.70)                     g = 'C';
  else                                           g = 'D';
  const silver = (mods & ((1 << 3) | (1 << 10))) !== 0;
  if (silver) {
    if (g === 'S')  return 'SH';
    if (g === 'SS') return 'SSH';
  }
  return g;
}

export function computeTaikoScoreV2Timeline(
  session: TaikoSession,
  modDiff: ModDifficulty,
): ScoreFrame[] {
  const { objects, hitResults, replay } = session;

  const lazerMods = replay.scoreInfo?.mods ?? [];
  const modMult = computeTaikoModMultiplierV2(lazerMods);

  const objBySrc = new Map<number, TaikoHitObject>();
  for (const o of objects) {
    if (o.kind === 'drumroll' || o.kind === 'swell') {
      objBySrc.set(o.sourceIndex, o);
    }
  }

  let maxComboPortion = 0;
  let maxAccCount = 0;
  let simCombo = 0;
  for (const o of objects) {
    if (o.kind === 'hit') {
      simCombo += 1;
      maxComboPortion += 300 * taikoComboFactor(simCombo);
      maxAccCount += 1;
    }
  }

  const sorted = [...hitResults].sort((a, b) => a.time - b.time);

  let comboPortion = 0;
  let accBase = 0;
  let accCount = 0;
  let bonusPortion = 0;

  let combo = 0, maxCombo = 0;
  let c300 = 0, c100 = 0, miss = 0;

  const frames: ScoreFrame[] = [];

  for (const r of sorted) {
    if (r.comboIgnore) {
      const parent = objBySrc.get(r.objectIndex);
      if (r.strong === true) {

        bonusPortion += 50;
      } else if (parent?.kind === 'drumroll') {
        /** strong roll tick 额外奖励 150，当前判定未单独生成 strong 子结果。 */
        bonusPortion += 10;
        if (parent.isStrong) bonusPortion += 150;
      }
    } else {
      if (r.judgement === 0) {
        combo = 0;
        miss++;
        accBase += 0;
        accCount += 1;
      } else {
        combo += 1;
        if (combo > maxCombo) maxCombo = combo;
        const base = r.judgement === 300 ? 300 : 150;
        accBase += base;
        accCount += 1;
        comboPortion += base * taikoComboFactor(combo);
        if (r.judgement === 300) c300++; else c100++;

        if (r.strong === true) bonusPortion += 350;
      }
    }

    /** 运行准确率的分母为已判定音符数。 */
    const accuracy = accBase > 0 || accCount > 0
      ? (accCount > 0 ? accBase / (accCount * 300) : 0)
      : 0;
    const comboProgress = maxComboPortion > 0 ? comboPortion / maxComboPortion : 0;
    const accProgress = maxAccCount > 0 ? accCount / maxAccCount : 0;

    const inner = 250_000 * comboProgress
                + 750_000 * Math.pow(accuracy, 3.6) * accProgress
                + bonusPortion;
    const score = Math.round(Math.round(inner) * modMult);

    const grade = computeTaikoLazerGrade(accuracy, miss, modDiff.mods);
    frames.push({ time: r.time, score, combo, maxCombo, grade });
  }

  void c300; void c100;
  return frames;
}
