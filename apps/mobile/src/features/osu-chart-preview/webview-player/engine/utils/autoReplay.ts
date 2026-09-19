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
import type { BeatmapData, ReplayData, ReplayFrame } from '../types/index';

/**
 * One synthesized input sample in ABSOLUTE beatmap ms. The per-ruleset Auto
 * generators emit these; `synthesizeAutoReplay` converts them to the
 * `ReplayFrame` timeDelta encoding the rest of the pipeline consumes.
 */
export interface AutoFrame {
  time: number;        // absolute beatmap ms
  x: number;
  y: number;
  keys: number;        // bitmask: 1=M1, 2=M2, 4=K1, 8=K2
}

/**
 * Wrap generated auto-play frames into a stable-era `ReplayData` so the
 * existing judge/scoring/render pipeline consumes them unchanged.
 * Header counts are cosmetic — the score processor recomputes everything from
 * the judged hit results; `username = 'osu!'` serves as the display label, and
 * gameVersion < 30000000 keeps the stable judge path (no lazer scoreInfo block).
 * `mods` is the stable bitmask of the selected mods: the caller recomputes the
 * same `ModDifficulty` from it, so judgement/scoring/rendering/audio/stacking
 * all apply the mods — generators just place input against that modded difficulty.
 */
export function synthesizeAutoReplay(
  beatmap: BeatmapData,
  beatmapHash: string,
  autoFrames: AutoFrame[],
  mods = 0,
): ReplayData {
  // Stable sort keeps insertion order for equal timestamps (release-before-press
  // on overlapping objects); generators append mostly-monotonically already.
  const sorted = [...autoFrames].sort((a, b) => a.time - b.time);

  const frames: ReplayFrame[] = new Array(sorted.length);
  let prevTime = 0;
  for (let i = 0; i < sorted.length; i++) {
    const f = sorted[i]!;
    frames[i] = { timeDelta: f.time - prevTime, x: f.x, y: f.y, keys: f.keys };
    prevTime = f.time;
  }

  return {
    mode: beatmap.mode,
    gameVersion: 20240101,        // stable-era (< 30000000) → stable judge/scoring path
    beatmapHash,
    username: 'osu!',
    replayHash: '',
    count300: 0, count100: 0, count50: 0,
    countGeki: 0, countKatu: 0, countMiss: 0,
    score: 0, maxCombo: 0, perfect: false,
    mods,
    lifebarGraph: '',
    timestamp: 0n,
    frames,
    replayId: 0n,
  };
}
