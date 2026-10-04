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
/** 参考 osu!framework LegacyRandom；uint32 溢出用 >>>0，整数转换向零截断。 */
export class LegacyRandom {
  private x: number;
  private y = 842502087 >>> 0;
  private z = 3579807591 >>> 0;
  private w = 273326509 >>> 0;
  private bitBuffer = 0;
  private bitIndex = 32;

  static readonly INT_TO_REAL = 1.0 / 2147483648.0;
  static readonly INT_MASK = 0x7fffffff;

  constructor(seed = 1337) {
    this.x = seed >>> 0;
  }

  nextUInt(): number {
    const t = (this.x ^ (this.x << 11)) >>> 0;
    this.x = this.y;
    this.y = this.z;
    this.z = this.w;
    this.w = ((this.w ^ (this.w >>> 19)) ^ (t ^ (t >>> 8))) >>> 0;
    return this.w;
  }

  next(): number {
    return (LegacyRandom.INT_MASK & this.nextUInt()) >>> 0;
  }

  nextDouble(): number {
    return LegacyRandom.INT_TO_REAL * this.next();
  }

  nextIntRange(lo: number, hi: number): number {
    return Math.trunc(lo + this.nextDouble() * (hi - lo));
  }

  nextDoubleRange(lo: number, hi: number): number {
    return Math.trunc(lo + this.nextDouble() * (hi - lo));
  }

  /** 布尔值缓存 32 位，但与整数共享同一随机流。 */
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
