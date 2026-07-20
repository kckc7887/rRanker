import CryptoJS from 'crypto-js';
import JSZip from 'jszip';
import type { Difficulty, ScoreRecord } from '@/domain/models';

const AES_KEY_B64 = '6Jaa0qVAJZuXkZCLiOa/Ax5tIZVu+taKUN1V1nqwkks=';
const AES_IV_B64 = 'Kk/wisgNYwcAV8WVGMgyUw==';

class ByteReader {
  private view: DataView;
  pos: number;

  constructor(buf: ArrayBuffer | SharedArrayBuffer | Uint8Array, offset = 0) {
    if (buf instanceof Uint8Array) {
      this.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    } else {
      this.view = new DataView(buf);
    }
    this.pos = offset;
  }

  remaining(): number { return this.view.byteLength - this.pos; }

  getByte(): number { return this.view.getUint8(this.pos++); }

  getShort(): number {
    this.pos += 2;
    return this.view.getUint8(this.pos - 2) | (this.view.getUint8(this.pos - 1) << 8);
  }

  getInt(): number {
    this.pos += 4;
    return (
      (this.view.getUint8(this.pos - 4))
      | (this.view.getUint8(this.pos - 3) << 8)
      | (this.view.getUint8(this.pos - 2) << 16)
      | (this.view.getUint8(this.pos - 1) << 24)
    );
  }

  getFloat(): number {
    const v = this.view.getFloat32(this.pos, true);
    this.pos += 4;
    return v;
  }

  getVarInt(): number {
    const b = this.view.getUint8(this.pos);
    if (b < 128) { this.pos++; return b; }
    this.pos += 2;
    return (b & 0x7f) | (this.view.getUint8(this.pos - 1) << 7);
  }

  getString(): string {
    const len = this.getVarInt();
    const bytes = new Uint8Array(this.view.buffer, this.view.byteOffset + this.pos, len);
    const s = new TextDecoder().decode(bytes);
    this.pos += len;
    return s;
  }

  /** GameRecord 键格式：varshort(len) + utf8(len-2) + 2 字节校验，与 phiTool 一致 */
  getGameRecordKey(): string {
    const len = this.getVarInt();
    if (len < 2) throw new Error('GameRecord 键长度无效');
    const bytes = new Uint8Array(this.view.buffer, this.view.byteOffset + this.pos, len - 2);
    const key = new TextDecoder().decode(bytes);
    this.pos += len;
    return key;
  }
}

function wordArrayToUint8Array(wa: CryptoJS.lib.WordArray): Uint8Array {
  const out = new Uint8Array(wa.sigBytes);
  for (let i = 0; i < wa.sigBytes; i++) {
    out[i] = (wa.words[i >>> 2]! >>> (24 - (i % 4) * 8)) & 0xff;
  }
  return out;
}

function uint8ArrayToWordArray(data: Uint8Array): CryptoJS.lib.WordArray {
  const words: number[] = [];
  for (let i = 0; i < data.length; i += 4) {
    words.push(
      ((data[i] ?? 0) << 24)
      | ((data[i + 1] ?? 0) << 16)
      | ((data[i + 2] ?? 0) << 8)
      | (data[i + 3] ?? 0),
    );
  }
  return CryptoJS.lib.WordArray.create(words, data.length);
}

export function decryptAes(encryptedBase64: string): Uint8Array {
  const key = CryptoJS.enc.Base64.parse(AES_KEY_B64);
  const iv = CryptoJS.enc.Base64.parse(AES_IV_B64);
  const decrypted = CryptoJS.AES.decrypt(encryptedBase64, key, { iv });
  return wordArrayToUint8Array(decrypted);
}

export function decryptBytes(data: Uint8Array): Uint8Array {
  const key = CryptoJS.enc.Base64.parse(AES_KEY_B64);
  const iv = CryptoJS.enc.Base64.parse(AES_IV_B64);
  const decrypted = CryptoJS.AES.decrypt(
    // crypto-js 接受 { ciphertext: WordArray }；类型定义偏窄，这里按运行时契约传参
    { ciphertext: uint8ArrayToWordArray(data) } as unknown as string,
    key,
    { iv },
  );
  return wordArrayToUint8Array(decrypted);
}

export type PhigrosLevel = 0 | 1 | 2 | 3;

export const LEVEL_NAMES: Record<PhigrosLevel, string> = {
  0: 'EZ',
  1: 'HD',
  2: 'IN',
  3: 'AT',
};

const LEVEL_DIFFICULTY: Record<PhigrosLevel, Difficulty> = {
  0: 'basic',
  1: 'advanced',
  2: 'expert',
  3: 'master',
};

export type PhigrosDifficultyTable = Record<string, number[]>;

export type PhigrosScoreEntry = {
  songId: string;
  level: PhigrosLevel;
  difficulty: number;
  score: number;
  acc: number;
  fc: boolean;
  rks: number;
  targetAccForPlusOne?: number | null;
};

export type PhigrosB30 = {
  rks: number;
  best27: PhigrosScoreEntry[];
  phi3: PhigrosScoreEntry[];
  /** Best27 各曲 RKS 之和（计入总 RKS 分子） */
  best27RksSum: number;
  /** Phi3 各曲定数之和（计入总 RKS 分子；与 phiTool parse_b27 一致） */
  phi3ContributionSum: number;
  /** Best27 平均 RKS */
  best27AvgRks: number;
  /** Phi3 平均定数贡献 */
  phi3AvgContribution: number;
};

export type PhigrosSummary = {
  saveVersion: number;
  challengeModeRank: number;
  rankingScore: number;
  gameVersion: number;
  avatar: string;
  cleared: [number, number, number, number];
  fullCombo: [number, number, number, number];
  phi: [number, number, number, number];
};

export type PhigrosSaveData = {
  summary: PhigrosSummary;
  gameRecord: Record<string, (PhigrosScoreEntry | null)[]>;
  updatedAt: string;
};

export function parseSummary(summaryBase64: string): PhigrosSummary {
  const hexStr = CryptoJS.enc.Base64.parse(summaryBase64).toString(CryptoJS.enc.Hex);
  const bytes = new Uint8Array(hexStr.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
  const r = new ByteReader(bytes);

  const result: PhigrosSummary = {
    saveVersion: r.getByte(),
    challengeModeRank: r.getShort(),
    rankingScore: r.getFloat(),
    gameVersion: r.getVarInt(),
    avatar: r.getString(),
    cleared: [0, 0, 0, 0],
    fullCombo: [0, 0, 0, 0],
    phi: [0, 0, 0, 0],
  };

  for (let lv = 0; lv < 4; lv++) {
    result.cleared[lv] = r.getShort();
    result.fullCombo[lv] = r.getShort();
    result.phi[lv] = r.getShort();
  }

  return result;
}

export function parseGameRecord(
  buf: ArrayBuffer | SharedArrayBuffer | Uint8Array,
): Record<string, (PhigrosScoreEntry | null)[]> {
  const r = new ByteReader(buf);
  const record: Record<string, (PhigrosScoreEntry | null)[]> = {};

  // 与 astrbot GameRecord 一致：首 varint 仅作 songsnum 记录，循环以 remaining 为准。
  // 若以首 varint 为上限，常见值为 27，会导致只解析 B27 条而非完整存档。
  if (r.remaining() > 0) {
    r.getVarInt();
  }

  // 对齐 phiTool PhigrosLibrary.GameRecord.read：
  // varshort(keyLen) + utf8(keyLen-2) + checksum2 + u8(bodyLen) + body；仅 EZ/HD/IN/AT。
  while (r.remaining() > 0) {
    const key = r.getGameRecordKey();
    const lengthBytePos = r.pos;
    const bodyLength = r.getByte();
    const nextPos = lengthBytePos + bodyLength + 1;

    const exist = r.getByte();
    const fcFlag = r.getByte();
    const levels: (PhigrosScoreEntry | null)[] = [null, null, null, null];

    for (let lv = 0; lv < 4; lv++) {
      if ((exist >> lv) & 1) {
        const score = r.getInt();
        const acc = r.getFloat();
        const isFullCombo = (score === 1000000 && acc === 100) || !!((fcFlag >> lv) & 1);
        levels[lv] = {
          songId: key,
          level: lv as PhigrosLevel,
          difficulty: 0,
          score,
          acc: Math.round(acc * 100) / 100,
          fc: isFullCombo,
          rks: 0,
        };
      }
    }

    r.pos = nextPos;
    record[key] = levels;
  }

  return record;
}

/** 成绩定数：acc 为存档中的百分数（0–100）；acc≥100% 时等于谱面定数 */
export function calculateRks(difficulty: number, acc: number): number {
  if (acc < 70) return 0;
  return difficulty * ((acc - 55) / 45) ** 2;
}

export function roundRks(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/** Phi3 槽：acc=100% 按谱面定数降序取前三；与分数/AP 无关，贡献取谱面定数 */
export function selectPhi3(allRecords: PhigrosScoreEntry[]): PhigrosScoreEntry[] {
  return [...allRecords]
    .filter((r) => r.acc >= 100)
    .sort((a, b) => b.difficulty - a.difficulty)
    .slice(0, 3);
}

/** Phi3 槽位对总 RKS 的贡献 = 谱面定数之和（非成绩定数） */
export function sumPhi3Contribution(allRecords: PhigrosScoreEntry[]): number {
  return selectPhi3(allRecords).reduce((sum, s) => sum + s.difficulty, 0);
}

/** 将存档 gameRecord 展开为带定数与 RKS 的全部游玩记录 */
export function collectScoredEntries(
  gameRecord: Record<string, (PhigrosScoreEntry | null)[]>,
  difficultyTable: PhigrosDifficultyTable,
): PhigrosScoreEntry[] {
  const allRecords: PhigrosScoreEntry[] = [];

  for (const [songId, levels] of Object.entries(gameRecord)) {
    const diffs = difficultyTable[songId];
    if (!diffs) continue;
    for (let lv = 0; lv < 4; lv++) {
      const entry = levels[lv];
      if (!entry || lv >= diffs.length) continue;
      const diff = diffs[lv];
      allRecords.push({
        ...entry,
        difficulty: diff,
        rks: calculateRks(diff, entry.acc),
      });
    }
  }

  return allRecords;
}

export function phigrosEntryToScoreRecord(entry: PhigrosScoreEntry): ScoreRecord {
  return {
    songId: entry.songId,
    title: entry.songId,
    type: 'SD',
    levelIndex: entry.level,
    level: LEVEL_NAMES[entry.level],
    difficulty: LEVEL_DIFFICULTY[entry.level],
    difficultyConstant: entry.difficulty,
    achievements: entry.acc,
    dxScore: entry.score,
    rating: entry.rks,
    fc: entry.fc ? 'ap' : null,
    fs: null,
    rate: entry.score === 1000000 && entry.acc === 100
      ? 'phi'
      : entry.fc
        ? 'fc'
        : entry.acc >= 96
          ? 'v'
          : entry.acc >= 92
            ? 's'
            : 'a',
    version: 'current',
  };
}

/** 完整存档成绩列表（全部已游玩谱面，按 RKS 降序） */
export function gameRecordToScoreRecords(
  gameRecord: Record<string, (PhigrosScoreEntry | null)[]>,
  difficultyTable: PhigrosDifficultyTable,
): ScoreRecord[] {
  return collectScoredEntries(gameRecord, difficultyTable)
    .map(phigrosEntryToScoreRecord)
    .sort((a, b) => b.rating - a.rating || b.achievements - a.achievements);
}

export function computeB30(
  gameRecord: Record<string, (PhigrosScoreEntry | null)[]>,
  difficultyTable: PhigrosDifficultyTable,
): PhigrosB30 {
  const allRecords = collectScoredEntries(gameRecord, difficultyTable);

  const sortedByRks = [...allRecords].sort((a, b) => b.rks - a.rks);
  const best27 = sortedByRks.slice(0, 27);
  const phi3 = selectPhi3(allRecords);

  const best27RksSum = best27.reduce((sum, s) => sum + s.rks, 0);
  const phi3ContributionSum = phi3.reduce((sum, s) => sum + s.difficulty, 0);
  const finalRks = roundRks((best27RksSum + phi3ContributionSum) / 30);

  const displayRks2 = Math.floor(finalRks * 100) / 100;
  const targetRks = displayRks2 + 0.01 - 0.005;

  const scoredBest27 = best27.map((song) => {
    if (song.acc >= 100) return { ...song, targetAccForPlusOne: null };

    const diff = song.difficulty;
    let low = Math.max(song.acc, 70.01);
    let high = 100.0;
    let target: number | null = null;

    for (let iter = 0; iter < 100; iter++) {
      const mid = (low + high) / 2;
      const newRks = calculateRks(diff, mid);

      const tempBest27 = best27.map((s) =>
        s.songId === song.songId && s.level === song.level ? { rks: newRks } : { rks: s.rks },
      );
      const tempBestSum = tempBest27.reduce((s, r) => s + r.rks, 0);

      let tempPhiSum = phi3ContributionSum;
      if (mid >= 100) {
        const candidates = allRecords
          .map((r) => {
            if (r.songId === song.songId && r.level === song.level) {
              return { difficulty: diff, qualifies: mid >= 100 };
            }
            return { difficulty: r.difficulty, qualifies: r.acc >= 100 };
          })
          .filter((r) => r.qualifies)
          .sort((a, b) => b.difficulty - a.difficulty)
          .slice(0, 3);
        tempPhiSum = candidates.reduce((s, r) => s + r.difficulty, 0);
      }

      const tempRks = (tempBestSum + tempPhiSum) / 30;

      if (tempRks >= targetRks) {
        target = mid;
        high = mid;
      } else {
        low = mid;
      }
    }

    return {
      ...song,
      targetAccForPlusOne: target && target <= 100 ? Math.round(target * 100) / 100 : 100.0,
    };
  });

  return {
    rks: finalRks,
    best27: scoredBest27,
    phi3,
    best27RksSum,
    phi3ContributionSum,
    best27AvgRks: best27.length ? roundRks(best27RksSum / best27.length) : 0,
    phi3AvgContribution: phi3.length ? roundRks(phi3ContributionSum / phi3.length) : 0,
  };
}

export async function decodeSaveZip(zipBuf: ArrayBuffer): Promise<{
  gameRecord: Record<string, (PhigrosScoreEntry | null)[]>;
}> {
  const zip = await JSZip.loadAsync(zipBuf);

  const gameRecordFile = zip.file('gameRecord');
  if (!gameRecordFile) throw new Error('存档缺少 gameRecord');
  const gameRecordBuf = await gameRecordFile.async('uint8array');
  const recordVersion = gameRecordBuf[0];
  if (recordVersion !== 1) throw new Error('存档版本不支持');
  const encryptedRecord = gameRecordBuf.subarray(1);
  const decryptedRecord = decryptBytes(encryptedRecord);
  const gameRecord = parseGameRecord(decryptedRecord);

  return { gameRecord };
}

export function loadDifficultyTable(raw: string): PhigrosDifficultyTable {
  const table: PhigrosDifficultyTable = {};
  for (const line of raw.trim().split('\n')) {
    const cols = line.split('\t');
    const id = cols[0];
    table[id] = cols.slice(1).map(Number);
  }
  return table;
}
