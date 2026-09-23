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

/** osu!stable mod bitmask flags, as stored in `.osr` headers and `ReplayData.mods`. */
export const Mod = {
  NoFail:      1 << 0,   // 1
  Easy:        1 << 1,   // 2
  TouchDevice: 1 << 2,   // 4
  Hidden:      1 << 3,   // 8
  HardRock:    1 << 4,   // 16
  SuddenDeath: 1 << 5,   // 32
  DoubleTime:  1 << 6,   // 64
  Relax:       1 << 7,   // 128
  HalfTime:    1 << 8,   // 256
  Nightcore:   (1 << 9) | (1 << 6),  // 576 — NC always implies DT
  Flashlight:  1 << 10,  // 1024
  SpunOut:     1 << 12,  // 4096
  Perfect:     1 << 14,  // 16384 — PF always implies SD
} as const;

/** True if the stable mod bitmask `mods` has any bit of `flag` set. */
export function hasMod(mods: number, flag: number): boolean {
  return (mods & flag) !== 0;
}

/**
 * Mod-adjusted difficulty settings, computed once per load by
 * `computeModDifficulty(beatmap, replay)`. This object is the single source of
 * truth for difficulty-derived values: all consumers (rendering, hit detection,
 * scoring, audio) read from it — raw beatmap stats are never used directly.
 */
export interface ModDifficulty {
  /** Mod-adjusted approach rate (HR/EZ applied). */
  readonly ar: number;
  /** Mod-adjusted circle size (HR/EZ applied). */
  readonly cs: number;
  /** Mod-adjusted overall difficulty (HR/EZ applied; mania windows use the flat multiplier instead). */
  readonly od: number;
  /** Mod-adjusted HP drain rate (HR/EZ applied). */
  readonly hp: number;

  /** Approach-circle preempt time in beatmap ms, derived from AR. */
  readonly preemptMs: number;
  /** Hit-object fade-in duration in beatmap ms, derived from preempt. */
  readonly fadeInMs: number;
  /** Circle radius in osu!pixels (includes stable's 1.00041 factor; lazer drops it). */
  readonly circleRadiusPx: number;
  /** Integer (floored) std hit windows in ms — stable semantics: `int(|delta|) < window`. */
  readonly hitWindow300: number;
  readonly hitWindow100: number;
  readonly hitWindow50: number;
  /** Unrounded std hit windows in ms — lazer semantics: `|delta| <= windowU`. */
  readonly hitWindow300U: number;
  readonly hitWindow100U: number;
  readonly hitWindow50U: number;

  // Taiko half-windows (ms): strict < for Great/Ok, ≤ for Miss outer bound.
  // Rounded (`floor(W) - 0.5`, stable) and unrounded (lazer) variants.
  readonly taikoHitWindowGreat: number;
  readonly taikoHitWindowOk: number;
  readonly taikoHitWindowMiss: number;
  readonly taikoHitWindowGreatU: number;
  readonly taikoHitWindowOkU: number;
  readonly taikoHitWindowMissU: number;

  // Mania hit windows (ms). Six results per press; computed via
  // `floor(DifficultyRange(od, ...) * mult) + 0.5` so integer-ms deltas land
  // strictly inside their window. Compared in beatmap-time (replay frame deltas
  // and object times share the same clock — same convention as taiko).
  readonly maniaHitWindowPerfect: number;
  readonly maniaHitWindowGreat: number;
  readonly maniaHitWindowGood: number;
  readonly maniaHitWindowOk: number;
  readonly maniaHitWindowMeh: number;
  readonly maniaHitWindowMiss: number;

  /** Playback rate: 1.0 nomod, 1.5 DT/NC, 0.75 HT, or a custom lazer `speed_change`. */
  readonly speed: number;
  /**
   * Stable mod bitmask. For lazer replays (acronym mods) this is reconstructed
   * from the boolean flags below so bitmask-based consumers (score multiplier,
   * grade) keep working; mods with no stable bit (AC, CO) are only visible via
   * their flags.
   */
  readonly mods: number;

  readonly isHR: boolean;
  readonly isEZ: boolean;
  readonly isDT: boolean;
  readonly isHT: boolean;
  readonly isNC: boolean;
  readonly isHD: boolean;
  readonly isFL: boolean;
  readonly isNF: boolean;
  // Mania-specific mods. isHD (Hidden) and isFL (Flashlight) reuse the shared
  // flags; the mania ruleset interprets them with mania semantics (cover / band).
  readonly isMirror: boolean;
  // FadeIn — mania cover mod (notes appear out of nowhere; spawn-side cover).
  readonly isFadeIn: boolean;
  // Cover (CO) — lazer-only configurable mania cover.
  readonly isCover: boolean;
  // CO coverage fraction (0.2–0.8) and expand direction (true = AlongScroll =
  // spawn-side cover, false = AgainstScroll = hit-line-side cover).
  readonly coverCoverage: number;
  readonly coverAlong: boolean;
  readonly isSD: boolean;
  readonly isPF: boolean;
  // Lazer AccuracyChallenge; no stable equivalent.
  readonly isAC: boolean;
  /** Lazer Constant Speed（acronym CS）。没有对应的 stable 位。 */
  readonly isConstantSpeed: boolean;

  /** True for lazer replays (has a `scoreInfo` block, or gameVersion >= 30000000). */
  readonly isLazer: boolean;
  // CL (Classic): stable-like behavior inside a lazer replay.
  readonly isCL: boolean;
  // CL sub-settings (each defaults TRUE when CL is on, FALSE otherwise):
  // no_slider_head_accuracy / classic_note_lock / always_play_tail_sample / classic_health.
  readonly lzNoSliderAcc: boolean;
  readonly lzLegacyNotelock: boolean;
  readonly lzLegacySound: boolean;
  readonly lzLegacyHP: boolean;
}

// osu!'s DifficultyRange mapping (as in danser's DifficultyRate); the float32
// round-trip on `diff` matches stable precision.
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

// Lazer client_version is date-stamped `YYYY.MDD.R` (e.g. "2025.509.0"). Returns
// true only when we can CONFIRM the version is at least `year.mdd` (mdd = month*100
// + day). Missing / empty / unparseable versions return false: modern lazer always
// stamps a version, so an absent one means an old (pre-versioning) replay.
function lazerVersionAtLeast(clientVersion: string | undefined, year: number, mdd: number): boolean {
  if (!clientVersion) return false;
  const m = clientVersion.match(/^(\d{4})\.(\d{1,4})/);
  if (!m) return false;
  const y = parseInt(m[1]!, 10);
  const md = parseInt(m[2]!, 10);
  if (y !== year) return y > year;
  return md >= mdd;
}

/**
 * Compute the mod-adjusted difficulty for a (beatmap, replay) pair. Dispatches
 * on lazer acronym mods when `replay.scoreInfo` is present, else on the stable
 * bitmask in `replay.mods`. Call once per load and pass the result everywhere.
 */
export function computeModDifficulty(beatmap: BeatmapData, replay: ReplayData): ModDifficulty {
  const scoreInfo = replay.scoreInfo;
  const isLazer = (scoreInfo !== undefined) || replay.gameVersion >= 30000000;

  let ar = beatmap.approachRate;
  let cs = beatmap.circleSize;
  let od = beatmap.overallDifficulty;
  let hp = beatmap.hpDrainRate;
  let speed = 1;
  // OD used for mania hit windows: DA override applied (lazer), but NOT the
  // HR/EZ scaling that std/taiko bake into `od` — mania uses a flat window
  // multiplier instead. Set after the DA loop in the lazer branch.
  let maniaBaseOd = beatmap.overallDifficulty;

  let isHR = false, isEZ = false, isDT = false, isHT = false, isNC = false, isHD = false, isFL = false;
  let isNF = false, isSD = false, isPF = false, isAC = false, isConstantSpeed = false;
  let isMirror = false, isFadeIn = false, isCover = false;
  let coverCoverage = 0.5, coverAlong = true;
  // Mania flat window multiplier (ManiaModHardRock/Easy set HitWindows.DifficultyMultiplier;
  // OD itself is NOT scaled in mania). HR = 1.4, EZ = 1/1.4, default 1.
  let maniaDifficultyMultiplier = 1;
  let isCL = false;
  // CL (Classic) sub-settings; FALSE outside CL.
  let lzNoSliderAcc = false;
  let lzLegacyNotelock = false;
  let lzLegacySound = false;
  let lzLegacyHP = false;

  if (scoreInfo && scoreInfo.mods.length > 0) {
    // Lazer acronym dispatch. DA sets base AR/CS/OD/HP; HR/EZ still stack on top.
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
    // Mania windows derive from OD after DA but before HR/EZ scaling.
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
          // Direction serialises as the enum ordinal (0 = AlongScroll, 1 = AgainstScroll)
          // or its name; AlongScroll is lazer's default.
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
    // Mania-specific stable bits (osu! Mods enum): FadeIn = 1<<20, Mirror = 1<<30.
    // Random (1<<21) is intentionally not handled — its stable column shuffle is
    // unrecoverable (closed-source algorithm; seed even discarded by lazer's decoder).
    if (hasMod(mods, 1 << 20)) isFadeIn = true;
    if (hasMod(mods, 1 << 30)) isMirror = true;
  }

  const preempt = difficultyRate(ar, 1800, 1200, 450);
  const fadeIn = 400 * Math.min(1, preempt / 450);
  // Lazer drops stable's 1.00041 widescreen-bug multiplier.
  const circleRadius = isLazer
    ? (54.4 - 4.48 * cs)
    : (54.4 - 4.48 * cs) * 1.00041;
  const hitWindow300U = 80  - 6  * od;
  const hitWindow100U = 140 - 8  * od;
  const hitWindow50U  = 200 - 10 * od;
  const hitWindow300 = Math.floor(hitWindow300U);
  const hitWindow100 = Math.floor(hitWindow100U);
  const hitWindow50  = Math.floor(hitWindow50U);

  // Stable's `floor(W) - 0.5` puts cutoffs strictly outside integer-ms boundaries.
  const taikoHitWindowGreatU = difficultyRate(od, 50,  35, 20);
  const taikoHitWindowOkU    = difficultyRate(od, 120, 80, 50);
  const taikoHitWindowMissU  = difficultyRate(od, 135, 95, 70);
  const taikoHitWindowGreat  = Math.floor(taikoHitWindowGreatU) - 0.5;
  const taikoHitWindowOk     = Math.floor(taikoHitWindowOkU)    - 0.5;
  const taikoHitWindowMiss   = Math.floor(taikoHitWindowMissU)  - 0.5;

  // Five lower mania windows use `X − 3*OD` ms, which DifficultyRange reproduces
  // exactly (lazer non-classic and stable agree here).
  // Marvelous (Perfect) diverges: stable + lazer-with-Classic use a **constant 16ms**
  // base (NOT OD-scaled), lazer non-classic uses OD-scaled 22.4→13.9. Stable replays
  // must use the constant form or the Perfect bucket loses/absorbs hits.
  //
  // The constant base is exactly 16, applied with the same `floor(base × mult) + 0.5`
  // / `≤` convention as the lower windows (verified per-note against osu!'s own
  // judgements on real stable replays): OD 7 nomod catches |delta| ≤ 16
  // (floor(16·1)+0.5 = 16.5); OD 7.7 DT catches |delta| ≤ 24 (floor(16·1.5)+0.5 = 24.5).
  //
  // Mania windows are NOT OD-scaled by HR/EZ (unlike std/taiko). Instead lazer's
  // ManiaHitWindows applies `totalMultiplier = speedMultiplier / difficultyMultiplier`
  // to the base width: HR ⇒ difficultyMultiplier 1.4 (windows tighten), EZ ⇒ 1/1.4
  // (widen). Mania also adjusts windows by the gameplay RATE so the real-world window
  // stays constant (IManiaRateAdjustmentMod) — unlike std/taiko, which keep windows
  // fixed in map time. In our beatmap-time domain that means scaling by `speed`
  // (×1.5 DT, ×0.75 HT). So `maniaTotalMult = speed / maniaDifficultyMultiplier`,
  // applied INSIDE the floor (matching `Math.Floor(range * mult) + 0.5`). All this
  // collapses to identity at nomod (speed = 1, multiplier = 1).
  // The mania HR/EZ window multiplier only matches stable from lazer commit 8e53f47
  // (2025-05-09) onward; earlier lazer builds left mania windows untouched by HR/EZ.
  // Stable always applied it. Speed (rate) scaling predates this and always applies.
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

  // Bitmask reconstruction keeps stable-only consumers (computeModMultiplier, etc.) working.
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
    // AC and CO have no stable bit; visible only via modDiff.isAC / isCover.
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
