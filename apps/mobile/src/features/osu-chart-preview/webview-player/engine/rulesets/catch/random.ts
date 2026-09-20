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
/**
 * LegacyRandom — byte-for-byte port of osu!framework's `LegacyRandom` (== osu!stable's
 * `FastRandom`), the xorshift PRNG that drives catch position generation. A single
 * `LegacyRandom(1337)` is shared across a beatmap's whole offset pass; the exact NUMBER and
 * ORDER of draws must match ppy/osu or every generated fruit X drifts.
 *
 * Cast discipline: every uint32 op is normalised with `>>> 0` to match C# `uint`
 * wrap/overflow (e.g. `x << 11` overflows as a signed int in JS — `>>> 0` re-normalises it).
 * No `Math.imul`: the core step is XOR/shift only, all 32-bit-safe. `Math.trunc` reproduces
 * C#'s `(int)` truncation-toward-zero — load-bearing for negative results (e.g. the
 * tiny-droplet `Next(-20, 20)`).
 *
 * `nextBool` keeps its own `bitBuffer`/`bitIndex` but refills from the shared core stream via
 * `nextUInt`, so bools and ints interleave on one stream — carry both or HardRock desyncs.
 */
export class LegacyRandom {
  private x: number; // uint32
  private y = 842502087 >>> 0;
  private z = 3579807591 >>> 0;
  private w = 273326509 >>> 0;
  private bitBuffer = 0; // uint32
  private bitIndex = 32;

  static readonly INT_TO_REAL = 1.0 / 2147483648.0; // 1 / (int.MaxValue + 1)
  static readonly INT_MASK = 0x7fffffff;

  constructor(seed = 1337) {
    this.x = seed >>> 0; // (uint)seed
  }

  /** Core xorshift128 step: NextUInt(), range [0, 2^32). */
  nextUInt(): number {
    const t = (this.x ^ (this.x << 11)) >>> 0;
    this.x = this.y;
    this.y = this.z;
    this.z = this.w;
    this.w = ((this.w ^ (this.w >>> 19)) ^ (t ^ (t >>> 8))) >>> 0;
    return this.w;
  }

  /** Next() => (int)(int_mask & NextUInt()), range [0, 2^31). */
  next(): number {
    return (LegacyRandom.INT_MASK & this.nextUInt()) >>> 0;
  }

  /** NextDouble() => int_to_real * Next(), range [0, 1). */
  nextDouble(): number {
    return LegacyRandom.INT_TO_REAL * this.next();
  }

  /** Next(int lo, int hi) => (int)(lo + NextDouble() * (hi - lo)). */
  nextIntRange(lo: number, hi: number): number {
    return Math.trunc(lo + this.nextDouble() * (hi - lo));
  }

  /** Next(double lo, double hi) — identical formula; distinct overload at the C# call sites. */
  nextDoubleRange(lo: number, hi: number): number {
    return Math.trunc(lo + this.nextDouble() * (hi - lo));
  }

  /** NextBool(): one bit per call from a 32-bit buffer refilled via nextUInt(). */
  nextBool(): boolean {
    if (this.bitIndex === 32) {
      this.bitBuffer = this.nextUInt();
      this.bitIndex = 1;
      return (this.bitBuffer & 1) === 1;
    }
    this.bitIndex++;
    this.bitBuffer = this.bitBuffer >>> 1;
    return (this.bitBuffer & 1) === 1;
  }
}
