import CryptoJS from 'crypto-js';
import JSZip from 'jszip';

const AES_KEY_B64 = '6Jaa0qVAJZuXkZCLiOa/Ax5tIZVu+taKUN1V1nqwkks=';
const AES_IV_B64 = 'Kk/wisgNYwcAV8WVGMgyUw==';

class ByteReader {
  private view: DataView;
  pos: number;

  constructor(buf: ArrayBuffer | SharedArrayBuffer | Uint8Array, offset = 0) {
    this.view = new DataView(buf instanceof Uint8Array ? buf.buffer : buf);
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
    const dec = new TextDecoder();
    const s = dec.decode(new Uint8Array(this.view.buffer, this.pos, len));
    this.pos += len;
    return s;
  }

  skipVarInt(): void {
    if (this.view.getUint8(this.pos) > 127) this.pos += 2;
    else this.pos++;
  }
}

export function decryptAes(encryptedBase64: string): Uint8Array {
  const key = CryptoJS.enc.Base64.parse(AES_KEY_B64);
  const iv = CryptoJS.enc.Base64.parse(AES_IV_B64);
  const decrypted = CryptoJS.AES.decrypt(encryptedBase64, key, { iv });
  return new Uint8Array(
    decrypted.words
      .map((w) => [w >>> 24, (w >>> 16) & 0xff, (w >>> 8) & 0xff, w & 0xff])
      .flat(),
  );
}

export function decryptBytes(data: Uint8Array): Uint8Array {
  const key = CryptoJS.enc.Base64.parse(AES_KEY_B64);
  const iv = CryptoJS.enc.Base64.parse(AES_IV_B64);
  const wordArray = CryptoJS.lib.WordArray.create(data);
  const decrypted = CryptoJS.AES.decrypt(
    { ciphertext: wordArray } as unknown as string,
    key,
    { iv },
  );
  return new Uint8Array(
    decrypted.words
      .map((w) => [w >>> 24, (w >>> 16) & 0xff, (w >>> 8) & 0xff, w & 0xff])
      .flat(),
  );
}

export type PhigrosLevel = 0 | 1 | 2 | 3;

export const LEVEL_NAMES: Record<PhigrosLevel, string> = {
  0: 'EZ',
  1: 'HD',
  2: 'IN',
  3: 'AT',
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
};

export type PhigrosSummary = {
  saveVersion: number;
  challengeModeRank: number;
  rankingScore: number;
  gameVersion: number;
  avatar: string;
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

  return {
    saveVersion: r.getByte(),
    challengeModeRank: r.getShort(),
    rankingScore: r.getFloat(),
    gameVersion: r.getVarInt(),
    avatar: r.getString(),
  };
}

export function parseGameRecord(buf: ArrayBuffer | SharedArrayBuffer): Record<string, (PhigrosScoreEntry | null)[]> {
  const r = new ByteReader(buf);
  const songsNum = r.getVarInt();
  const record: Record<string, (PhigrosScoreEntry | null)[]> = {};

  for (let i = 0; i < songsNum && r.remaining() > 0; i++) {
    const key = r.getString();
    r.skipVarInt();
    const lengthFlag = r.getByte();
    const fcFlag = r.getByte();

    const levels: (PhigrosScoreEntry | null)[] = [];
    for (let lv = 0; lv < 5; lv++) {
      if (lengthFlag & (1 << lv)) {
        const score = r.getInt();
        const acc = r.getFloat();
        const isFullCombo = (score === 1000000 && acc === 100) || !!(fcFlag & (1 << lv));
        levels[lv] = {
          songId: key,
          level: lv as PhigrosLevel,
          difficulty: 0,
          score,
          acc: Math.round(acc * 100) / 100,
          fc: isFullCombo,
          rks: 0,
        };
      } else {
        levels[lv] = null;
      }
    }
    record[key] = levels;
  }
  return record;
}

export function calculateRks(difficulty: number, acc: number): number {
  if (acc < 55) return 0;
  return difficulty * ((acc - 55) / 45) ** 2;
}

export function computeB30(
  gameRecord: Record<string, (PhigrosScoreEntry | null)[]>,
  difficultyTable: PhigrosDifficultyTable,
): PhigrosB30 {
  const allRecords: PhigrosScoreEntry[] = [];

  for (const [songId, levels] of Object.entries(gameRecord)) {
    const diffs = difficultyTable[songId];
    if (!diffs) continue;
    for (let lv = 0; lv < 4; lv++) {
      const entry = levels[lv];
      if (!entry || lv >= diffs.length) continue;
      const diff = diffs[lv];
      const rks = calculateRks(diff, entry.acc);
      allRecords.push({
        ...entry,
        difficulty: diff,
        rks: Math.round(rks * 100) / 100,
      });
    }
  }

  const sortedByRks = [...allRecords].sort((a, b) => b.rks - a.rks);
  const best27 = sortedByRks.slice(0, 27);

  const phiRecords = allRecords.filter((r) => r.score === 1000000 && r.acc === 100);
  const sortedByDiff = [...phiRecords].sort((a, b) => b.difficulty - a.difficulty);
  const phi3 = sortedByDiff.slice(0, 3);

  const best27RksSum = best27.reduce((sum, s) => sum + s.rks, 0);
  const phi3DiffSum = phi3.reduce((sum, s) => sum + s.difficulty, 0);
  const finalRks = Math.round(((best27RksSum + phi3DiffSum) / 30) * 100) / 100;

  const targetRks = finalRks + 0.01 - 0.005;
  const scoredBest27 = best27.map((song) => {
    if (song.score === 1000000) return { ...song, targetAccForPlusOne: null };

    const diff = song.difficulty;
    let low = Math.max(55.01, song.acc);
    let high = 100.0;
    let target: number | null = null;

    for (let iter = 0; iter < 100; iter++) {
      const mid = (low + high) / 2;
      const newRks = calculateRks(diff, mid);

      const tempBest27 = best27.map((s) =>
        s.songId === song.songId && s.level === song.level ? { rks: newRks } : { rks: s.rks },
      );
      const tempBestSum = tempBest27.reduce((s, r) => s + r.rks, 0);

      let tempPhi3DiffSum = 0;
      if (song.score === 1000000 && mid >= 100) {
        const candidates = allRecords
          .map((r) => {
            if (r.songId === song.songId && r.level === song.level) {
              return { difficulty: diff, isPhi: mid >= 100 };
            }
            return { difficulty: r.difficulty, isPhi: r.score === 1000000 };
          })
          .filter((r) => r.isPhi)
          .sort((a, b) => b.difficulty - a.difficulty)
          .slice(0, 3);
        tempPhi3DiffSum = candidates.reduce((s, r) => s + r.difficulty, 0);
      } else {
        tempPhi3DiffSum = phi3DiffSum;
      }

      const tempRks = (tempBestSum + tempPhi3DiffSum) / 30;
      if (tempRks >= targetRks) {
        target = mid;
        high = mid;
      } else {
        low = mid;
      }
    }

    return { ...song, targetAccForPlusOne: target && target <= 100 ? Math.round(target * 100) / 100 : 100.0 };
  });

  return { rks: finalRks, best27: scoredBest27, phi3 };
}

export async function decodeSaveZip(zipBuf: ArrayBuffer): Promise<{
  gameRecord: Record<string, (PhigrosScoreEntry | null)[]>;
}> {
  const zip = await JSZip.loadAsync(zipBuf);

  const gameRecordBuf = await zip.file('gameRecord')!.async('arraybuffer');
  const gameRecordBytes = new Uint8Array(gameRecordBuf);
  const recordVersion = gameRecordBytes[0];
  if (recordVersion !== 1) throw new Error('存档版本不支持');
  const encryptedRecord = gameRecordBytes.slice(1);
  const decryptedRecord = decryptBytes(encryptedRecord);
  const gameRecord = parseGameRecord(decryptedRecord.buffer);

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
