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
import type { BeatmapData, ReplayData } from '../types/index';

export const Mod = {
  NoFail:      1 << 0,
  Easy:        1 << 1,
  TouchDevice: 1 << 2,
  Hidden:      1 << 3,
  HardRock:    1 << 4,
  SuddenDeath: 1 << 5,
  DoubleTime:  1 << 6,
  Relax:       1 << 7,
  HalfTime:    1 << 8,
  Nightcore:   (1 << 9) | (1 << 6),  /** NC 同时包含 DT 位。 */
  Flashlight:  1 << 10,
  SpunOut:     1 << 12,
  Perfect:     1 << 14,  /** PF 同时包含 SD 位。 */
} as const;

export function hasMod(mods: number, flag: number): boolean {
  return (mods & flag) !== 0;
}

export interface ModDifficulty {

  readonly ar: number;

  readonly cs: number;

  readonly od: number;

  readonly hp: number;

  readonly preemptMs: number;

  readonly fadeInMs: number;

  readonly circleRadiusPx: number;
  /** stable 窗口向下取整，使用 int(|delta|)<window。 */
  readonly hitWindow300: number;
  readonly hitWindow100: number;
  readonly hitWindow50: number;
  /** lazer 窗口不取整，使用 |delta|≤window。 */
  readonly hitWindow300U: number;
  readonly hitWindow100U: number;
  readonly hitWindow50U: number;

  readonly taikoHitWindowGreat: number;
  readonly taikoHitWindowOk: number;
  readonly taikoHitWindowMiss: number;
  readonly taikoHitWindowGreatU: number;
  readonly taikoHitWindowOkU: number;
  readonly taikoHitWindowMissU: number;

  readonly maniaHitWindowPerfect: number;
  readonly maniaHitWindowGreat: number;
  readonly maniaHitWindowGood: number;
  readonly maniaHitWindowOk: number;
  readonly maniaHitWindowMeh: number;
  readonly maniaHitWindowMiss: number;

  readonly speed: number;

  readonly mods: number;

  readonly isHR: boolean;
  readonly isEZ: boolean;
  readonly isDT: boolean;
  readonly isHT: boolean;
  readonly isNC: boolean;
  readonly isHD: boolean;
  readonly isFL: boolean;
  readonly isNF: boolean;

  readonly isMirror: boolean;

  readonly isFadeIn: boolean;

  readonly isCover: boolean;

  readonly coverCoverage: number;
  readonly coverAlong: boolean;
  readonly isSD: boolean;
  readonly isPF: boolean;

  readonly isAC: boolean;
  /** lazer Constant Speed（CS）没有 stable 对应位。 */
  readonly isConstantSpeed: boolean;

  readonly isLazer: boolean;

  readonly isCL: boolean;

  readonly lzNoSliderAcc: boolean;
  readonly lzLegacyNotelock: boolean;
  readonly lzLegacySound: boolean;
  readonly lzLegacyHP: boolean;
}

function difficultyRate(diff: number, min: number, mid: number, max: number): number {
  diff = Math.fround(diff);
  if (diff > 5) return mid + (max - mid) * (diff - 5) / 5;
  if (diff < 5) return mid - (mid - min) * (5 - diff) / 5;
  return mid;
}

function boolSetting(settings: Record<string, unknown> | undefined, key: string, defaultValue: boolean): boolean {
  if (!settings) return defaultValue;
  const v = settings[key];
  return typeof v === 'boolean' ? v : defaultValue;
}

function numSetting(settings: Record<string, unknown> | undefined, key: string): number | undefined {
  if (!settings) return undefined;
  const v = settings[key];
  return typeof v === 'number' ? v : undefined;
}

/** lazer client_version 用 YYYY.MDD.R 判断现行回放判定规则。 */

function lazerVersionAtLeast(clientVersion: string | undefined, year: number, mdd: number): boolean {
  if (!clientVersion) return false;
  const m = clientVersion.match(/^(\d{4})\.(\d{1,4})/);
  if (!m) return false;
  const y = parseInt(m[1]!, 10);
  const md = parseInt(m[2]!, 10);
  if (y !== year) return y > year;
  return md >= mdd;
}

export function computeModDifficulty(beatmap: BeatmapData, replay: ReplayData): ModDifficulty {
  const scoreInfo = replay.scoreInfo;
  const isLazer = (scoreInfo !== undefined) || replay.gameVersion >= 30000000;

  let ar = beatmap.approachRate;
  let cs = beatmap.circleSize;
  let od = beatmap.overallDifficulty;
  let hp = beatmap.hpDrainRate;
  let speed = 1;
  /** mania 使用 DA 后的 OD，HR/EZ 仅乘窗口系数。 */

  let maniaBaseOd = beatmap.overallDifficulty;

  let isHR = false, isEZ = false, isDT = false, isHT = false, isNC = false, isHD = false, isFL = false;
  let isNF = false, isSD = false, isPF = false, isAC = false, isConstantSpeed = false;
  let isMirror = false, isFadeIn = false, isCover = false;
  let coverCoverage = 0.5, coverAlong = true;
  /** mania 窗口系数：HR=1.4，EZ=1/1.4。 */

  let maniaDifficultyMultiplier = 1;
  let isCL = false;

  let lzNoSliderAcc = false;
  let lzLegacyNotelock = false;
  let lzLegacySound = false;
  let lzLegacyHP = false;

  if (scoreInfo && scoreInfo.mods.length > 0) {

    for (const mod of scoreInfo.mods) {
      if (mod.acronym === 'DA') {
        const daAr = numSetting(mod.settings, 'approach_rate');
        const daCs = numSetting(mod.settings, 'circle_size');
        const daOd = numSetting(mod.settings, 'overall_difficulty');
        const daHp = numSetting(mod.settings, 'drain_rate');
        if (daAr !== undefined) ar = daAr;
        if (daCs !== undefined) cs = daCs;
        if (daOd !== undefined) od = daOd;
        if (daHp !== undefined) hp = daHp;
      }
    }

    maniaBaseOd = od;
    for (const mod of scoreInfo.mods) {
      switch (mod.acronym) {
        case 'HR':
          isHR = true;
          ar = Math.min(ar * 1.4, 10);
          cs = Math.min(cs * 1.3, 10);
          od = Math.min(od * 1.4, 10);
          hp = Math.min(hp * 1.4, 10);
          maniaDifficultyMultiplier = 1.4;
          break;
        case 'EZ':
          isEZ = true;
          ar /= 2;
          cs /= 2;
          od /= 2;
          hp /= 2;
          maniaDifficultyMultiplier = 1 / 1.4;
          break;
        case 'DT': {
          isDT = true;
          const sc = numSetting(mod.settings, 'speed_change');
          speed = sc ?? 1.5;
          break;
        }
        case 'NC': {
          isDT = true;
          isNC = true;
          const sc = numSetting(mod.settings, 'speed_change');
          speed = sc ?? 1.5;
          break;
        }
        case 'HT': {
          isHT = true;
          const sc = numSetting(mod.settings, 'speed_change');
          speed = sc ?? 0.75;
          break;
        }
        case 'DC': {
          isHT = true;
          const sc = numSetting(mod.settings, 'speed_change');
          speed = sc ?? 0.75;
          break;
        }
        case 'HD': isHD = true; break;
        case 'FL': isFL = true; break;
        case 'CS': isConstantSpeed = true; break;
        case 'MR': isMirror = true; break;
        case 'FI': isFadeIn = true; break;
        case 'CO': {
          isCover = true;
          const cov = numSetting(mod.settings, 'coverage');
          if (cov !== undefined) coverCoverage = cov;

          const dir = mod.settings?.['direction'];
          if (typeof dir === 'number') coverAlong = dir === 0;
          else if (typeof dir === 'string') coverAlong = !/against/i.test(dir);
          break;
        }
        case 'NF': isNF = true; break;
        case 'SD': isSD = true; break;
        case 'PF': isSD = true; isPF = true; break;
        case 'AC': isAC = true; break;
        case 'CL':
          isCL = true;
          lzNoSliderAcc    = boolSetting(mod.settings, 'no_slider_head_accuracy', true);
          lzLegacyNotelock = boolSetting(mod.settings, 'classic_note_lock',       true);
          lzLegacySound    = boolSetting(mod.settings, 'always_play_tail_sample', true);
          lzLegacyHP       = boolSetting(mod.settings, 'classic_health',          true);
          break;
      }
    }
  } else {
    const mods = replay.mods;
    if (hasMod(mods, Mod.HardRock)) {
      isHR = true;
      ar = Math.min(ar * 1.4, 10);
      cs = Math.min(cs * 1.3, 10);
      od = Math.min(od * 1.4, 10);
      hp = Math.min(hp * 1.4, 10);
      maniaDifficultyMultiplier = 1.4;
    }
    if (hasMod(mods, Mod.Easy)) {
      isEZ = true;
      ar /= 2;
      cs /= 2;
      od /= 2;
      hp /= 2;
      maniaDifficultyMultiplier = 1 / 1.4;
    }
    if (hasMod(mods, Mod.DoubleTime)) { isDT = true; speed = 1.5; }
    else if (hasMod(mods, Mod.HalfTime)) { isHT = true; speed = 0.75; }
    if (hasMod(mods, 1 << 9))         isNC = true;
    if (hasMod(mods, Mod.Hidden))     isHD = true;
    if (hasMod(mods, Mod.Flashlight)) isFL = true;
    if (hasMod(mods, Mod.NoFail))     isNF = true;
    if (hasMod(mods, Mod.SuddenDeath)) isSD = true;
    if (hasMod(mods, Mod.Perfect))    { isSD = true; isPF = true; }
    /** stable Random 的列洗牌无法从回放重建，当前不支持。 */

    if (hasMod(mods, 1 << 20)) isFadeIn = true;
    if (hasMod(mods, 1 << 30)) isMirror = true;
  }

  const preempt = difficultyRate(ar, 1800, 1200, 450);
  const fadeIn = 400 * Math.min(1, preempt / 450);

  const circleRadius = isLazer
    ? (54.4 - 4.48 * cs)
    : (54.4 - 4.48 * cs) * 1.00041;
  const hitWindow300U = 80  - 6  * od;
  const hitWindow100U = 140 - 8  * od;
  const hitWindow50U  = 200 - 10 * od;
  const hitWindow300 = Math.floor(hitWindow300U);
  const hitWindow100 = Math.floor(hitWindow100U);
  const hitWindow50  = Math.floor(hitWindow50U);

  const taikoHitWindowGreatU = difficultyRate(od, 50,  35, 20);
  const taikoHitWindowOkU    = difficultyRate(od, 120, 80, 50);
  const taikoHitWindowMissU  = difficultyRate(od, 135, 95, 70);
  const taikoHitWindowGreat  = Math.floor(taikoHitWindowGreatU) - 0.5;
  const taikoHitWindowOk     = Math.floor(taikoHitWindowOkU)    - 0.5;
  const taikoHitWindowMiss   = Math.floor(taikoHitWindowMissU)  - 0.5;

  /** mania Perfect：stable/CL 基础窗口为 16ms，非 Classic lazer 随 OD 改变。 */

  /** mania 窗口在谱面时间内乘播放速率，再除 HR/EZ 系数，最后取整。 */

  /** lazer 自 2025-05-09 起才对 mania 窗口应用 HR/EZ；stable 始终应用。 */

  const appliesManiaDiffMult = !isLazer
    || lazerVersionAtLeast(scoreInfo?.client_version, 2025, 509);
  const maniaTotalMult = speed / (appliesManiaDiffMult ? maniaDifficultyMultiplier : 1);
  const usesStableManiaWindows = !isLazer || isCL;
  const maniaHitWindowPerfect = usesStableManiaWindows
    ? Math.floor(16 * maniaTotalMult) + 0.5
    : Math.floor(difficultyRate(maniaBaseOd, 22.4, 19.4, 13.9) * maniaTotalMult) + 0.5;
  const maniaHitWindowGreat = Math.floor(difficultyRate(maniaBaseOd, 64,  49,  34)  * maniaTotalMult) + 0.5;
  const maniaHitWindowGood  = Math.floor(difficultyRate(maniaBaseOd, 97,  82,  67)  * maniaTotalMult) + 0.5;
  const maniaHitWindowOk    = Math.floor(difficultyRate(maniaBaseOd, 127, 112, 97)  * maniaTotalMult) + 0.5;
  const maniaHitWindowMeh   = Math.floor(difficultyRate(maniaBaseOd, 151, 136, 121) * maniaTotalMult) + 0.5;
  const maniaHitWindowMiss  = Math.floor(difficultyRate(maniaBaseOd, 188, 173, 158) * maniaTotalMult) + 0.5;

  let modsBitmask: number;
  if (scoreInfo) {
    modsBitmask = 0;
    if (isHR) modsBitmask |= Mod.HardRock;
    if (isEZ) modsBitmask |= Mod.Easy;
    if (isDT) modsBitmask |= Mod.DoubleTime;
    if (isHT) modsBitmask |= Mod.HalfTime;
    if (isNC) modsBitmask |= (1 << 9);
    if (isHD) modsBitmask |= Mod.Hidden;
    if (isFL) modsBitmask |= Mod.Flashlight;
    if (isNF) modsBitmask |= Mod.NoFail;
    if (isSD) modsBitmask |= Mod.SuddenDeath;
    if (isPF) modsBitmask |= Mod.Perfect;
    if (isFadeIn) modsBitmask |= (1 << 20);
    if (isMirror) modsBitmask |= (1 << 30);

  } else {
    modsBitmask = replay.mods;
  }

  return {
    ar, cs, od, hp,
    preemptMs: preempt,
    fadeInMs: fadeIn,
    circleRadiusPx: circleRadius,
    hitWindow300, hitWindow100, hitWindow50,
    hitWindow300U, hitWindow100U, hitWindow50U,
    taikoHitWindowGreat, taikoHitWindowOk, taikoHitWindowMiss,
    taikoHitWindowGreatU, taikoHitWindowOkU, taikoHitWindowMissU,
    maniaHitWindowPerfect, maniaHitWindowGreat, maniaHitWindowGood,
    maniaHitWindowOk, maniaHitWindowMeh, maniaHitWindowMiss,
    speed,
    mods: modsBitmask,
    isHR, isEZ, isDT, isHT, isNC, isHD, isFL,
    isNF, isSD, isPF, isAC,
    isMirror, isFadeIn, isCover, coverCoverage, coverAlong,
    isLazer, isCL, isConstantSpeed,
    lzNoSliderAcc, lzLegacyNotelock, lzLegacySound, lzLegacyHP,
  };
}
