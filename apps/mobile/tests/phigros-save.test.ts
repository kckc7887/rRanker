import { describe, expect, it } from 'vitest';
import CryptoJS from 'crypto-js';
import JSZip from 'jszip';
import {
  calculateRks,
  computeB30,
  decryptBytes,
  decodeSaveZip,
  gameRecordToScoreRecords,
  loadDifficultyTable,
  parseGameRecord,
  roundRks,
  selectPhi3,
  sumPhi3Contribution,
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

  it('parseGameRecord reads until buffer end when header count is wrong', () => {
    function buildSong(id: string, level: number, score: number, acc: number): number[] {
      const keyPayload = new Uint8Array([...new TextEncoder().encode(id), 0, 0]);
      const body = [
        1 << level,
        0,
        ...writeIntLE(score),
        ...writeFloatLE(acc),
      ];
      return [
        ...writeVarShort(keyPayload.length),
        ...keyPayload,
        body.length,
        ...body,
      ];
    }

    const payload = new Uint8Array([
      ...writeVarShort(1),
      ...buildSong('A.A', 2, 900000, 95),
      ...buildSong('B.B', 1, 950000, 97),
      ...buildSong('C.C', 0, 800000, 90),
    ]);
    const record = parseGameRecord(payload);
    expect(Object.keys(record).sort()).toEqual(['A.A', 'B.B', 'C.C']);
  });

  it('gameRecordToScoreRecords returns all played charts, not only B27', () => {
    const gameRecord = {
      'Glaciaxion.SunsetRay': [
        { songId: 'Glaciaxion.SunsetRay', level: 0 as const, difficulty: 0, score: 900000, rawAcc: 95, acc: 95, fc: false, rks: 0 },
        null,
        { songId: 'Glaciaxion.SunsetRay', level: 2 as const, difficulty: 0, score: 984131, rawAcc: 99.69, acc: 99.69, fc: false, rks: 0 },
        null,
      ],
      'Test.Other': [
        null,
        { songId: 'Test.Other', level: 1 as const, difficulty: 0, score: 950000, rawAcc: 97, acc: 97, fc: true, rks: 0 },
        null,
        null,
      ],
    };
    const table = loadDifficultyTable(
      'Glaciaxion.SunsetRay\t1.0\t6.5\t12.6\nTest.Other\t2.0\t7.0\t\n',
    );
    const records = gameRecordToScoreRecords(gameRecord, table);
    expect(records).toHaveLength(3);
    expect(records.map((r) => `${r.songId}:${r.levelIndex}`)).toEqual([
      'Glaciaxion.SunsetRay:2',
      'Test.Other:1',
      'Glaciaxion.SunsetRay:0',
    ]);
    expect(records[0]?.difficulty).toBe('expert');
    expect(records[1]?.level).toBe('HD');
  });

  it('calculateRks returns 0 below 70% acc', () => {
    expect(calculateRks(15, 69.99)).toBe(0);
    expect(calculateRks(15, 70)).toBeGreaterThan(0);
    expect(calculateRks(15, 100)).toBe(15);
  });

  it('selectPhi3 counts raw acc 99.996 as 100%', () => {
    const records = [
      {
        songId: 'Near',
        level: 2 as const,
        difficulty: 15,
        score: 999000,
        rawAcc: 99.996,
        acc: 100,
        fc: false,
        rks: 15,
      },
    ];
    expect(selectPhi3(records)).toHaveLength(1);
    expect(sumPhi3Contribution(records)).toBe(15);
  });

  it('computeB30: Best27 用成绩定数，Phi3 用 acc=100% 的谱面定数，除以 30', () => {
    const gameRecord = {
      'Perfect.P': [
        null,
        null,
        { songId: 'Perfect.P', level: 2 as const, difficulty: 0, score: 1000000, rawAcc: 100, acc: 100, fc: true, rks: 0 },
        null,
      ],
      'AP.A': [
        null,
        null,
        { songId: 'AP.A', level: 2 as const, difficulty: 0, score: 1000000, rawAcc: 99.5, acc: 99.5, fc: true, rks: 0 },
        null,
      ],
      'Good.G': [
        null,
        null,
        { songId: 'Good.G', level: 2 as const, difficulty: 0, score: 980000, rawAcc: 98, acc: 98, fc: false, rks: 0 },
        null,
      ],
    };
    const table = loadDifficultyTable(
      'Perfect.P\t1\t1\t15.0\nAP.A\t1\t1\t16.0\nGood.G\t1\t1\t10.0\n',
    );
    const b30 = computeB30(gameRecord, table);
    const apRks = 16.0 * ((99.5 - 55) / 45) ** 2;
    const goodRks = 10.0 * ((98 - 55) / 45) ** 2;

    expect(b30.phi3.map((s) => s.songId)).toEqual(['Perfect.P']);
    expect(b30.phi3ContributionSum).toBeCloseTo(15, 4);
    expect(b30.rks).toBe(roundRks((apRks + 15 + goodRks + 15) / 30));
  });

  it('selectPhi3 picks acc=100% by chart constant, ignores AP without 100% acc', () => {
    const records = [
      { songId: 'AP', level: 2 as const, difficulty: 16, score: 1000000, rawAcc: 99.5, acc: 99.5, fc: true, rks: 15.5 },
      { songId: 'HighAcc', level: 2 as const, difficulty: 12, score: 990000, rawAcc: 100, acc: 100, fc: false, rks: 12 },
    ];
    expect(selectPhi3(records).map((r) => r.songId)).toEqual(['HighAcc']);
    expect(sumPhi3Contribution(records)).toBe(12);
  });
});
