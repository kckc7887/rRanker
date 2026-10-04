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

export class Player {
  private _currentTimeMs = 0;
  private _playing = false;
  private _lastClockMs = 0;
  private _clockFn: () => number = () => performance.now();
  readonly durationMs: number;

  constructor(durationMs: number) {
    this.durationMs = durationMs;
  }

  /** 时钟返回单调递增的毫秒值。 */
  setClockFn(fn: (() => number) | null): void {
    this._clockFn = fn ?? (() => performance.now());
  }

  get currentTimeMs(): number {
    if (!this._playing) return this._currentTimeMs;
    const elapsed = this._clockFn() - this._lastClockMs;
    return Math.min(this._currentTimeMs + elapsed, this.durationMs);
  }

  get isPlaying(): boolean {
    return this._playing;
  }

  play(): void {
    if (this._playing) return;
    if (this._currentTimeMs >= this.durationMs) {
      this._currentTimeMs = 0;
    }
    this._lastClockMs = this._clockFn();
    this._playing = true;
  }

  pause(): void {
    if (!this._playing) return;
    this._currentTimeMs = this.currentTimeMs;
    this._playing = false;
  }

  seek(ms: number): void {
    const clamped = Math.max(0, Math.min(ms, this.durationMs));
    this._currentTimeMs = clamped;
    if (this._playing) {
      this._lastClockMs = this._clockFn();
    }
  }
}
