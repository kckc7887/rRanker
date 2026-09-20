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

// Catch scoring. The catch object → HitResult mapping (set in hitJudge.ts) is:
//   fruit       → 300 caught / 0 miss, comboBreak on miss          (Great)
//   droplet     → 100 caught / 0 miss, comboBreak on miss          (LargeTickHit)
//   tinyDroplet → 50  caught / 0 miss, comboIgnore                 (SmallTickHit)
//   banana      → 300 caught / 0 miss, comboIgnore (bonus only)    (LargeBonus)
// The numeric `judgement` only flags caught (>0) vs missed (0); the V1/V2 weights below
// come from `catchType`, NOT that value. Combo = fruit + droplet only; accuracy =
// fruit + droplet + tinyDroplet (bananas excluded). No hit windows.

/**
 * Running catch accuracy after each judged object. Catch weights every fruit/droplet/tiny
 * equally (caught ⇒ 300/300, missed ⇒ 0/300) → caught / total over those three; bananas
 * (bonus) never count. The shared computeAccTimeline can't be reused: it skips comboIgnore
 * results, which would drop tiny droplets.
 */
export function computeCatchAccTimeline(results: readonly HitResult[]): AccFrame[] {
  const sorted = [...results].sort((a, b) => a.time - b.time);

  const frames: AccFrame[] = [];
  let caught = 0;
  let judged = 0;
  for (const r of sorted) {
    if (r.catchType === 'banana') continue;   // bonus: accuracy-neutral
    judged++;
    if (r.judgement > 0) caught++;
    frames.push({ time: r.time, acc: judged > 0 ? caught / judged : 1 });
  }
  return frames;
}

// Catch grade is purely accuracy-cutoff based (CatchScoreProcessor.RankFromAccuracy):
// X 100% / S 98% / A 94% / B 90% / C 85%. Stable uses the same thresholds, so V1 and V2
// share this. HD/FL → silver SS/S.
function catchGrade(accuracy: number, mods: number): Grade {
  let g: Grade;
  if      (accuracy >= 1.0)  g = 'SS';
  else if (accuracy >= 0.98) g = 'S';
  else if (accuracy >= 0.94) g = 'A';
  else if (accuracy >= 0.90) g = 'B';
  else if (accuracy >= 0.85) g = 'C';
  else                       g = 'D';

  const silver = (mods & ((1 << 3) | (1 << 10))) !== 0;  // HD or FL
  if (silver) {
    if (g === 'S')  return 'SH';
    if (g === 'SS') return 'SSH';
  }
  return g;
}

// Catch V1 mod multiplier (GetLegacyScoreMultiplier). Differs from the shared std
// table only in HR (1.12, not 1.06). Scales the combo bonus at display time. NC sets the
// DT bit too, so bit 6 covers both.
function catchV1ModMultiplier(mods: number): number {
  let m = 1;
  if (mods & (1 << 0))  m *= 0.5;   // NoFail
  if (mods & (1 << 1))  m *= 0.5;   // Easy
  if (mods & (1 << 8))  m *= 0.3;   // HalfTime / Daycore
  if (mods & (1 << 3))  m *= 1.06;  // Hidden
  if (mods & (1 << 4))  m *= 1.12;  // HardRock (catch-custom)
  if (mods & (1 << 6))  m *= 1.06;  // DoubleTime / Nightcore
  if (mods & (1 << 10)) m *= 1.12;  // Flashlight
  if (mods & (1 << 7))  m *= 0;     // Relax — no score
  return m;
}

// Stable ScoreV1 (per stable's simulateHit): Fruit 300 (+ combo-scaled bonus), Droplet 100, TinyDroplet 10,
// Banana 1100 (bonus). Only fruit get the combo multiplier; only fruit + droplet build
// combo. scoreIncrease/25 is integer division (300/25 = 12); scoreMultiplier is the
// difficulty "peppy stars" factor (computeDifficultyMultiplier). Displayed score mirrors
// taiko/std V1: accuracyScore + bonusScore + round(comboScore × modMult).
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
        if (hit) accuracyScore += 10;            // no combo
      } else if (hit) {
        combo++;
        if (combo > maxCombo) maxCombo = combo;
        if (r.catchType === 'fruit') {
          accuracyScore += 300;
          comboScore += Math.trunc(Math.max(0, combo - 1) * 12 * diffMult);
        } else {                                 // droplet
          accuracyScore += 100;
        }
      } else {
        combo = 0;                               // fruit/droplet miss breaks combo
      }
    }

    const acc   = judged > 0 ? caught / judged : 1;
    const score = accuracyScore + bonusScore + Math.round(comboScore * modMult);
    frames.push({ time: r.time, score, combo, maxCombo, grade: catchGrade(acc, modDiff.mods) });
  }
  return frames;
}

const COMBO_BASE = 4;
const LOG4_200 = Math.log(200) / Math.log(COMBO_BASE);   // log4(combo_cap) ≈ 3.8219

// GetComboScoreChange multiplier: clamp(log4(comboAfter), 0.5, log4(200)).
function comboFactor(combo: number): number {
  if (combo <= 0) return 0.5;
  const l = Math.log(combo) / Math.log(COMBO_BASE);
  return Math.min(LOG4_200, Math.max(0.5, l));
}

function hasDefaultConfig(mod: LazerMod): boolean {
  return mod.settings === undefined || Object.keys(mod.settings).length === 0;
}

// Lazer RateAdjustModHelper.ScoreMultiplier; speed truncated to a 0.1 step first.
function rateAdjustMultiplier(speed: number): number {
  const truncated = Math.trunc(speed * 10) / 10;
  const offset = truncated - 1;
  return speed >= 1 ? 1 + offset / 5 : 0.6 + offset;
}

// Catch V2 mod multiplier (lazer's catch score-multiplier table). HR 1.12 (vs taiko's
// 1.06); DT/NC/HT/DC are rate-adjusted; CL 0.96; RX 0.1; HD/HR/FL collapse to 1 when
// the mod carries a non-default configuration.
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

// CatchScoreProcessor.ComputeTotalScore: a fixed 400k slice is reserved for tiny droplets,
// scaled by their share of (tiny + fruit). The rest is the log-curve combo portion; bananas
// add a flat 200 bonus each. comboProgress = running comboPortion / full-map maxComboPortion
// (final-frame-exact, like taiko/mania); dropletsHit = caught tinies / total tinies.
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

  // Full-map max combo portion: every fruit/droplet caught, in start-time order.
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

/**
 * Running score/combo/grade after each judged object. Dispatches on the replay's origin:
 * stable replays get ScoreV1, lazer replays get the standardised (1M-base) total —
 * matching what the .osr header's `score` field holds in each case.
 */
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

/**
 * Console diagnostic: log our final score / max combo / accuracy + per-type
 * caught-vs-total tally against the .osr header, so discrepancies are easy to spot.
 * The header `score` is the stable ScoreV1 total for stable replays and the standardised
 * total for lazer replays — the same branch as our dispatch, so it's apples-to-apples per
 * replay. (score + maxCombo are the unambiguous checks; the header's katu/geki split for
 * catch is replay-dependent, so header accuracy is best-effort.)
 */
export function logCatchScoreCheck(
  results: readonly HitResult[],
  scoreFrames: readonly ScoreFrame[],
  accFrames: readonly AccFrame[],
  replay: ReplayData,
  modDiff: ModDifficulty,
): void {
  const tally: Record<'fruit' | 'droplet' | 'tinyDroplet' | 'banana', { caught: number; total: number }> = {
    fruit:       { caught: 0, total: 0 },
    droplet:     { caught: 0, total: 0 },
    tinyDroplet: { caught: 0, total: 0 },
    banana:      { caught: 0, total: 0 },
  };
  for (const r of results) {
    if (r.catchType === undefined) continue;
    tally[r.catchType].total++;
    if (r.judgement > 0) tally[r.catchType].caught++;
  }

  const lastScore = scoreFrames[scoreFrames.length - 1];
  const lastAcc   = accFrames[accFrames.length - 1];
  const ourScore    = lastScore?.score ?? 0;
  const ourMaxCombo = lastScore?.maxCombo ?? 0;
  const ourGrade    = lastScore?.grade ?? 'D';
  const ourAcc      = lastAcc?.acc ?? 1;

  const hdrScore    = replay.score;
  const hdrMaxCombo = replay.maxCombo;
  const scorePct = hdrScore > 0 ? ((ourScore - hdrScore) / hdrScore) * 100 : 0;

  const hdrCaught = replay.count300 + replay.count100 + replay.count50;
  const hdrTotal  = hdrCaught + replay.countMiss + replay.countKatu + replay.countGeki;
  const hdrAcc = hdrTotal > 0 ? hdrCaught / hdrTotal : 1;

  console.groupCollapsed(
    `[catch score] ours ${ourScore.toLocaleString()} vs .osr ${hdrScore.toLocaleString()} ` +
    `(${scorePct >= 0 ? '+' : ''}${scorePct.toFixed(2)}%)  ${modDiff.isLazer ? 'V2/lazer' : 'V1/stable'}`,
  );
  console.table({
    score:        { ours: ourScore,    osr: hdrScore,    delta: ourScore - hdrScore },
    maxCombo:     { ours: ourMaxCombo, osr: hdrMaxCombo, delta: ourMaxCombo - hdrMaxCombo },
    'accuracy %': { ours: +(ourAcc * 100).toFixed(2), osr: +(hdrAcc * 100).toFixed(2), delta: +((ourAcc - hdrAcc) * 100).toFixed(2) },
  });
  console.table(tally);
  console.log(
    `grade ours=${ourGrade}   .osr counts: 300=${replay.count300} 100=${replay.count100} ` +
    `50=${replay.count50} katu=${replay.countKatu} geki=${replay.countGeki} miss=${replay.countMiss}`,
  );
  console.groupEnd();
}
