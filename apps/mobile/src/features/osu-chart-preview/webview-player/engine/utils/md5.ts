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
// Standard MD5 implementation (RFC 1321), dependency-free.

// Per-round shift amounts
const S = [
  7, 12, 17, 22,  7, 12, 17, 22,  7, 12, 17, 22,  7, 12, 17, 22,
  5,  9, 14, 20,  5,  9, 14, 20,  5,  9, 14, 20,  5,  9, 14, 20,
  4, 11, 16, 23,  4, 11, 16, 23,  4, 11, 16, 23,  4, 11, 16, 23,
  6, 10, 15, 21,  6, 10, 15, 21,  6, 10, 15, 21,  6, 10, 15, 21,
] as const;

// Precomputed integer part of abs(sin(i+1)) * 2^32, i = 0..63
const K = new Uint32Array(64);
for (let i = 0; i < 64; i++) {
  K[i] = (Math.abs(Math.sin(i + 1)) * 0x100000000) >>> 0;
}

function rotl(x: number, n: number): number {
  return (x << n) | (x >>> (32 - n));
}

/**
 * MD5 digest (RFC 1321) of `data`, returned as a 32-character lowercase hex
 * string. Known-good vectors: md5(b"") === "d41d8cd98f00b204e9800998ecf8427e",
 * md5(b"abc") === "900150983cd24fb0d6963f7d28e17f72".
 */
export function md5(data: Uint8Array): string {
  const msgLen = data.length;

  // Pad: append 0x80, then zeros, then 64-bit little-endian bit length
  const padLen = (msgLen % 64 < 56) ? (56 - msgLen % 64) : (120 - msgLen % 64);
  const padded = new Uint8Array(msgLen + padLen + 8);
  padded.set(data);
  padded[msgLen] = 0x80;

  const dv = new DataView(padded.buffer);
  const bitLo = (msgLen * 8) >>> 0;
  const bitHi = Math.floor(msgLen / 0x20000000) >>> 0; // msgLen * 8 / 2^32
  dv.setUint32(msgLen + padLen,     bitLo, true);
  dv.setUint32(msgLen + padLen + 4, bitHi, true);

  // Initial hash state
  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  // Process each 512-bit (64-byte) block
  for (let blk = 0; blk < padded.length; blk += 64) {
    const M = new Uint32Array(16);
    for (let j = 0; j < 16; j++) {
      M[j] = dv.getUint32(blk + j * 4, true);
    }

    let a = a0, b = b0, c = c0, d = d0;

    for (let i = 0; i < 64; i++) {
      let f: number;
      let g: number;

      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) % 16;
      }

      f = (f + a + K[i]! + M[g]!) >>> 0;
      a = d;
      d = c;
      c = b;
      b = (b + rotl(f, S[i]!)) >>> 0;
    }

    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }

  // Emit as little-endian bytes → hex
  let hex = '';
  for (const word of [a0, b0, c0, d0]) {
    for (let byte = 0; byte < 4; byte++) {
      hex += ((word >>> (byte * 8)) & 0xff).toString(16).padStart(2, '0');
    }
  }
  return hex;
}
