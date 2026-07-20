import { describe, expect, it } from 'vitest';
import CryptoJS from 'crypto-js';
import JSZip from 'jszip';
import {
  computeB30,
  decryptBytes,
  decodeSaveZip,
  loadDifficultyTable,
  parseGameRecord,
} from '@/domain/phigros';

const AES_KEY_B64 = '6Jaa0qVAJZuXkZCLiOa/Ax5tIZVu+taKUN1V1nqwkks=';
const AES_IV_B64 = 'Kk/wisgNYwcAV8WVGMgyUw==';

function writeVarShort(n: number): number[] {
  if (n < 128) return [n];
  return [(n & 0x7f) | 0x80, n >> 7];
}

function writeFloatLE(value: number): number[] {
  const buf = new ArrayBuffer(4);
  new DataView(buf).setFloat32(0, value, true);
  return Array.from(new Uint8Array(buf));
}

function writeIntLE(value: number): number[] {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
}

/** 按 phiTool GameRecord 二进制布局构造一条曲目记录 */
function buildGameRecordPayload(): Uint8Array {
  const songId = new TextEncoder().encode('Glaciaxion.SunsetRay');
  const keyPayload = new Uint8Array([...songId, 0, 0]);
  const score = 984131;
  const acc = 99.69075775146484;
  const body = [0b0100, 0, ...writeIntLE(score), ...writeFloatLE(acc)];
  const entry = [
    ...writeVarShort(keyPayload.length),
    ...keyPayload,
    body.length,
    ...body,
  ];
  return new Uint8Array([...writeVarShort(1), ...entry]);
}

function encryptPkcs7(plain: Uint8Array): Uint8Array {
  const key = CryptoJS.enc.Base64.parse(AES_KEY_B64);
  const iv = CryptoJS.enc.Base64.parse(AES_IV_B64);
  const words: number[] = [];
  for (let i = 0; i < plain.length; i += 4) {
    words.push(
      ((plain[i] ?? 0) << 24)
      | ((plain[i + 1] ?? 0) << 16)
      | ((plain[i + 2] ?? 0) << 8)
      | (plain[i + 3] ?? 0),
    );
  }
  const encrypted = CryptoJS.AES.encrypt(
    CryptoJS.lib.WordArray.create(words, plain.length),
    key,
    { iv },
  );
  const hex = encrypted.ciphertext.toString(CryptoJS.enc.Hex);
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

describe('phigros save parsing', () => {
  it('decryptBytes strips PKCS7 padding via sigBytes', () => {
    const plain = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
    const cipher = encryptPkcs7(plain);
    expect(Array.from(decryptBytes(cipher))).toEqual(Array.from(plain));
  });

  it('parseGameRecord strips 2-byte key checksum like phiTool', () => {
    const payload = buildGameRecordPayload();
    const record = parseGameRecord(payload);
    expect(Object.keys(record)).toEqual(['Glaciaxion.SunsetRay']);
    expect(record['Glaciaxion.SunsetRay']?.[2]).toMatchObject({
      songId: 'Glaciaxion.SunsetRay',
      score: 984131,
      acc: 99.69,
      fc: false,
    });
    expect(record['Glaciaxion.SunsetRay']?.[0]).toBeNull();
  });

  it('decodeSaveZip decrypts gameRecord and matches difficulty for B30', async () => {
    const plain = buildGameRecordPayload();
    const encrypted = encryptPkcs7(plain);
    const zip = new JSZip();
    zip.file('gameRecord', new Uint8Array([1, ...encrypted]));
    const zipBuf = await zip.generateAsync({ type: 'arraybuffer' });

    const { gameRecord } = await decodeSaveZip(zipBuf);
    expect(Object.keys(gameRecord)).toEqual(['Glaciaxion.SunsetRay']);

    const table = loadDifficultyTable('Glaciaxion.SunsetRay\t1.0\t6.5\t12.6\n');
    const b30 = computeB30(gameRecord, table);
    expect(b30.best27).toHaveLength(1);
    expect(b30.best27[0]?.songId).toBe('Glaciaxion.SunsetRay');
    expect(b30.best27[0]?.rks).toBeGreaterThan(0);
  });
});
