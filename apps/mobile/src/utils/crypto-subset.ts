/** crypto-js 主入口无法摇树，按子模块导入。 */
import AES from 'crypto-js/aes.js';
import HmacSHA1 from 'crypto-js/hmac-sha1.js';
import MD5 from 'crypto-js/md5.js';
import Base64 from 'crypto-js/enc-base64.js';
import Hex from 'crypto-js/enc-hex.js';
import core from 'crypto-js/core.js';

export const WordArray = core.lib.WordArray;
export { AES, HmacSHA1, MD5, Base64, Hex };

export function uint8ArrayToWordArray(data: Uint8Array) {
  const words: number[] = [];
  for (let i = 0; i < data.length; i += 4) {
    words.push(((data[i] ?? 0) << 24) | ((data[i + 1] ?? 0) << 16)
      | ((data[i + 2] ?? 0) << 8) | (data[i + 3] ?? 0));
  }
  return WordArray.create(words, data.length);
}

export function bytesToBase64(data: Uint8Array): string {
  return Base64.stringify(uint8ArrayToWordArray(data));
}

export function base64ToBytes(value: string): Uint8Array {
  const normalized = value.replace(/\s/gu, '');
  if (!/^[A-Za-z0-9+/]*={0,2}$/u.test(normalized) || normalized.length % 4 === 1) {
    throw new Error('Invalid Base64');
  }
  const decoded = Base64.parse(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='));
  return Uint8Array.from({ length: decoded.sigBytes }, (_, index) =>
    (decoded.words[index >>> 2]! >>> (24 - (index % 4) * 8)) & 0xff);
}
