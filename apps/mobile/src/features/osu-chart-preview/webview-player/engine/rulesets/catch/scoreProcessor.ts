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
import type { BeatmapData, ReplayData, HitResult, LazerMod } from '../../types/index';
import type { ModDifficulty } from '../../utils/modDifficulty';
import type { ScoreFrame, Grade } from '../../utils/scoreProcessor';
import { computeDifficultyMultiplier } from '../../utils/scoreProcessor';
import type { AccFrame } from '../../renderer/HUDRenderer';
import type { CatchObject } from './types';

/** combo 仅计水果和水滴；准确率还计 tiny，香蕉仅计奖励。 */

export function computeCatchAccTimeline(results: readonly HitResult[]): AccFrame[] {
  const sorted = [...results].sort((a, b) => a.time - b.time);

  const frames: AccFrame[] = [];
  let caught = 0;
  let judged = 0;
  for (const r of sorted) {
    if (r.catchType === 'banana') continue;
    judged++;
    if (r.judgement > 0) caught++;
    frames.push({ time: r.time, acc: judged > 0 ? caught / judged : 1 });
  }
  return frames;
}

function catchGrade(accuracy: number, mods: number): Grade {
  let g: Grade;
  if      (accuracy >= 1.0)  g = 'SS';
  else if (accuracy >= 0.98) g = 'S';
  else if (accuracy >= 0.94) g = 'A';
  else if (accuracy >= 0.90) g = 'B';
  else if (accuracy >= 0.85) g = 'C';
  else                       g = 'D';

  const silver = (mods & ((1 << 3) | (1 << 10))) !== 0;
  if (silver) {
    if (g === 'S')  return 'SH';
    if (g === 'SS') return 'SSH';
  }
  return g;
}

function catchV1ModMultiplier(mods: number): number {
  let m = 1;
  if (mods & (1 << 0))  m *= 0.5;
  if (mods & (1 << 1))  m *= 0.5;
  if (mods & (1 << 8))  m *= 0.3;
  if (mods & (1 << 3))  m *= 1.06;
  if (mods & (1 << 4))  m *= 1.12;
  if (mods & (1 << 6))  m *= 1.06;
  if (mods & (1 << 10)) m *= 1.12;
  if (mods & (1 << 7))  m *= 0;
  return m;
}

/** V1 仅水果享有 combo 加分；显示分数为基础分+奖励+round(combo 分×Mod)。 */

function computeCatchScoreV1Timeline(
  beatmap: BeatmapData,
  results: readonly HitResult[],
  modDiff: ModDifficulty,
): ScoreFrame[] {
  const modMult  = catchV1ModMultiplier(modDiff.mods);
  const diffMult = computeDifficultyMultiplier(beatmap);
  const sorted   = [...results].sort((a, b) => a.time - b.time);

  let accuracyScore = 0;
  let comboScore    = 0;
  let bonusScore    = 0;
  let combo = 0, maxCombo = 0;
  let caught = 0, judged = 0;

  const frames: ScoreFrame[] = [];
  for (const r of sorted) {
    const hit = r.judgement > 0;

    if (r.catchType === 'banana') {
      if (hit) bonusScore += 1100;
    } else {
      judged++;
      if (hit) caught++;

      if (r.catchType === 'tinyDroplet') {
        if (hit) accuracyScore += 10;
      } else if (hit) {
        combo++;
        if (combo > maxCombo) maxCombo = combo;
        if (r.catchType === 'fruit') {
          accuracyScore += 300;
          comboScore += Math.trunc(Math.max(0, combo - 1) * 12 * diffMult);
        } else {
          accuracyScore += 100;
        }
      } else {
        combo = 0;
      }
    }

    const acc   = judged > 0 ? caught / judged : 1;
    const score = accuracyScore + bonusScore + Math.round(comboScore * modMult);
    frames.push({ time: r.time, score, combo, maxCombo, grade: catchGrade(acc, modDiff.mods) });
  }
  return frames;
}

const COMBO_BASE = 4;
const LOG4_200 = Math.log(200) / Math.log(COMBO_BASE);

function comboFactor(combo: number): number {
  if (combo <= 0) return 0.5;
  const l = Math.log(combo) / Math.log(COMBO_BASE);
  return Math.min(LOG4_200, Math.max(0.5, l));
}

function hasDefaultConfig(mod: LazerMod): boolean {
  return mod.settings === undefined || Object.keys(mod.settings).length === 0;
}

/** 速率先截断到 0.1，再计算 Mod 倍率。 */
function rateAdjustMultiplier(speed: number): number {
  const truncated = Math.trunc(speed * 10) / 10;
  const offset = truncated - 1;
  return speed >= 1 ? 1 + offset / 5 : 0.6 + offset;
}

function catchV2ModMultiplier(lazerMods: readonly LazerMod[]): number {
  let m = 1;
  for (const mod of lazerMods) {
    switch (mod.acronym) {
      case 'NF': m *= 0.5; break;
      case 'EZ': m *= 0.5; break;
      case 'HR': m *= hasDefaultConfig(mod) ? 1.12 : 1.0; break;
      case 'HD': m *= hasDefaultConfig(mod) ? 1.06 : 1.0; break;
      case 'FL': m *= hasDefaultConfig(mod) ? 1.12 : 1.0; break;
      case 'CL': m *= 0.96; break;
      case 'RX': m *= 0.1; break;
      case 'DT':
      case 'NC': {
        const sc = mod.settings?.['speed_change'];
        m *= rateAdjustMultiplier(typeof sc === 'number' ? sc : 1.5);
        break;
      }
      case 'HT':
      case 'DC': {
        const sc = mod.settings?.['speed_change'];
        m *= rateAdjustMultiplier(typeof sc === 'number' ? sc : 0.75);
        break;
      }
    }
  }
  return m;
}

/** V2 给 tiny 预留 400k 分，剩余按 combo 对数曲线计分；香蕉每根加 200。 */

function computeCatchScoreV2Timeline(
  objects: readonly CatchObject[],
  results: readonly HitResult[],
  replay: ReplayData,
  modDiff: ModDifficulty,
): ScoreFrame[] {
  const modMult = catchV2ModMultiplier(replay.scoreInfo?.mods ?? []);

  let nFruit = 0, nTiny = 0;
  for (const o of objects) {
    if      (o.type === 'fruit')       nFruit++;
    else if (o.type === 'tinyDroplet') nTiny++;
  }
  const fruitTinyScale = (nTiny + nFruit) > 0 ? nTiny / (nTiny + nFruit) : 0;
  const comboPortionWeight   = 1000000 - 400000 * fruitTinyScale;
  const dropletsPortionWeight = 400000 * fruitTinyScale;

  let maxComboPortion = 0;
  let simCombo = 0;
  for (const o of [...objects].sort((a, b) => a.startTime - b.startTime)) {
    if      (o.type === 'fruit')   { simCombo++; maxComboPortion += 300 * comboFactor(simCombo); }
    else if (o.type === 'droplet') { simCombo++; maxComboPortion += 100 * comboFactor(simCombo); }
  }

  const sorted = [...results].sort((a, b) => a.time - b.time);

  let comboPortion = 0;
  let combo = 0, maxCombo = 0;
  let nTinyCaught = 0, nBananaCaught = 0;
  let caught = 0, judged = 0;

  const frames: ScoreFrame[] = [];
  for (const r of sorted) {
    const hit = r.judgement > 0;

    if (r.catchType === 'banana') {
      if (hit) nBananaCaught++;
    } else {
      judged++;
      if (hit) caught++;

      if (r.catchType === 'tinyDroplet') {
        if (hit) nTinyCaught++;
      } else if (hit) {
        combo++;
        if (combo > maxCombo) maxCombo = combo;
        comboPortion += (r.catchType === 'fruit' ? 300 : 100) * comboFactor(combo);
      } else {
        combo = 0;
      }
    }

    const comboProgress = maxComboPortion > 0 ? comboPortion / maxComboPortion : 0;
    const dropletsHit   = nTiny > 0 ? nTinyCaught / nTiny : 0;
    const bonusPortion  = 200 * nBananaCaught;
    const inner = comboPortionWeight * comboProgress
                + dropletsPortionWeight * dropletsHit
                + bonusPortion;
    const score = Math.round(Math.round(inner) * modMult);

    const acc = judged > 0 ? caught / judged : 1;
    frames.push({ time: r.time, score, combo, maxCombo, grade: catchGrade(acc, modDiff.mods) });
  }
  return frames;
}

export function computeCatchScoreTimeline(
  objects: readonly CatchObject[],
  results: readonly HitResult[],
  beatmap: BeatmapData,
  replay: ReplayData,
  modDiff: ModDifficulty,
): ScoreFrame[] {
  return modDiff.isLazer
    ? computeCatchScoreV2Timeline(objects, results, replay, modDiff)
    : computeCatchScoreV1Timeline(beatmap, results, modDiff);
}
