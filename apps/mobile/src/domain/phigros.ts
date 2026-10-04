import type CryptoJS from 'crypto-js';
import { AES, Base64, Hex, uint8ArrayToWordArray } from '@/utils/crypto-subset';
import JSZip from 'jszip';
import type { Difficulty, PhigrosChartNotes, ScoreRecord } from '@/domain/models';

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

  /** GameRecord 键为 varshort(len)+utf8(len−2)+2 字节校验，与 phiTool 一致。 */
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

export function decryptBytes(data: Uint8Array): Uint8Array {
  const key = Base64.parse(AES_KEY_B64);
  const iv = Base64.parse(AES_IV_B64);
  const decrypted = AES.decrypt(
    /** crypto-js 运行时接受 {ciphertext: WordArray}，类型定义偏窄。 */
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
  /** 准确率单位为百分数 0–100，保留存档精度。 */
  rawAcc: number;
  /** 展示准确率保留两位。 */
  acc: number;
  fc: boolean;
  rks: number;
  targetAccForPlusOne?: number | null;
};

export type PhigrosScoreRecord = {
  songId: string;
  level: PhigrosLevel;
  /** 此处 rks 表示谱面定数。 */
  difficultyConstant: number;
  score: number;
  /** 准确率单位为百分数 0–100，保留存档精度。 */
  rawAcc: number;
  /** 展示准确率保留两位。 */
  acc: number;
  /** 成绩 RKS 使用原始准确率计算。 */
  rks: number;
  fullCombo: boolean;
};

export type PhigrosB30 = {
  rks: number;
  best27: PhigrosScoreEntry[];
  phi3: PhigrosScoreEntry[];
  best27RksSum: number;
  /** Phi3 对总 RKS 的贡献取谱面定数之和。 */
  phi3ContributionSum: number;
  best27AvgRks: number;
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

export type PhigrosChallengeMode = {
  /** 颜色等级 0–5：白、绿、蓝、红、金、彩。 */
  level: number;
  /** 课题等级为 1–99，0 表示未激活。 */
  rank: number;
};

export type PhigrosSaveData = {
  summary: PhigrosSummary;
  gameRecord: Record<string, (PhigrosScoreEntry | null)[]>;
  updatedAt: string;
};

export type PhigrosUserProfile = {
  showPlayerId: boolean;
  selfIntro: string;
  avatar: string;
  backgroundSongId: string;
};

export type PhigrosGameProgress = {
  isFirstRun: boolean;
  legacyChapterFinished: boolean;
  alreadyShowCollectionTip: boolean;
  alreadyShowAutoUnlockINTip: boolean;
  completed: string;
  songUpdateInfo: number;
  challengeModeRank: number;
  /** Data 各项单位依次为 KiB、MiB、GiB、TiB、PiB。 */
  money: [number, number, number, number, number];
  unlockFlagOfSpasmodic: number;
  unlockFlagOfIgallta: number;
  unlockFlagOfRrharil: number;
  flagOfSongRecordKey: number;
  randomVersionUnlocked: number;
  chapter8UnlockBegin: boolean;
  chapter8UnlockSecondPhase: boolean;
  chapter8Passed: boolean;
  chapter8SongUnlocked: number;
};

export function parsePhigrosUser(buf: ArrayBuffer | SharedArrayBuffer | Uint8Array): PhigrosUserProfile {
  const r = new ByteReader(buf);
  const flags = r.remaining() > 0 ? r.getByte() : 0;
  return {
    showPlayerId: (flags & 1) !== 0,
    selfIntro: r.remaining() > 0 ? r.getString() : '',
    avatar: r.remaining() > 0 ? r.getString() : '',
    backgroundSongId: r.remaining() > 0 ? normalizePhigrosSongId(r.getString()) : '',
  };
}

/** 按 GameProgress 的二进制布局读取。 */
export function parsePhigrosGameProgress(
  buf: ArrayBuffer | SharedArrayBuffer | Uint8Array,
): PhigrosGameProgress {
  const r = new ByteReader(buf);
  const flags = r.getByte();
  const completed = r.getString();
  const songUpdateInfo = r.getVarInt();
  const challengeModeRank = r.getShort();
  const money = [r.getVarInt(), r.getVarInt(), r.getVarInt(), r.getVarInt(), r.getVarInt()] as PhigrosGameProgress['money'];
  const unlockFlagOfSpasmodic = r.getByte();
  const unlockFlagOfIgallta = r.getByte();
  const unlockFlagOfRrharil = r.getByte();
  const flagOfSongRecordKey = r.getByte();
  const randomVersionUnlocked = r.getByte();
  const chapter8Flags = r.getByte();
  return {
    isFirstRun: (flags & 1) !== 0,
    legacyChapterFinished: (flags & 2) !== 0,
    alreadyShowCollectionTip: (flags & 4) !== 0,
    alreadyShowAutoUnlockINTip: (flags & 8) !== 0,
    completed,
    songUpdateInfo,
    challengeModeRank,
    money,
    unlockFlagOfSpasmodic,
    unlockFlagOfIgallta,
    unlockFlagOfRrharil,
    flagOfSongRecordKey,
    randomVersionUnlocked,
    chapter8UnlockBegin: (chapter8Flags & 1) !== 0,
    chapter8UnlockSecondPhase: (chapter8Flags & 2) !== 0,
    chapter8Passed: (chapter8Flags & 4) !== 0,
    chapter8SongUnlocked: r.remaining() > 0 ? r.getByte() : 0,
  };
}

export function formatPhigrosDataMoney(money: readonly number[]): string {
  const units = ['KiB', 'MiB', 'GiB', 'TiB', 'PiB'] as const;
  const parts: string[] = [];
  for (let index = Math.min(money.length, units.length) - 1; index >= 0; index -= 1) {
    const value = money[index] ?? 0;
    if (value) parts.push(`${value}${units[index]}`);
  }
  return parts.join(' ') || '0KiB';
}

function base64ToBytes(b64: string): Uint8Array {
  const hexStr = Base64.parse(b64).toString(Hex);
  const pairs = hexStr.match(/.{2}/g);
  if (!pairs) return new Uint8Array(0);
  return new Uint8Array(pairs.map((b) => parseInt(b, 16)));
}

export function parseSummary(summaryBase64: string): PhigrosSummary {
  const bytes = base64ToBytes(summaryBase64);
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

/** challengeModeRank = level×100 + rank。 */
export function parseChallengeModeRank(challengeModeRank: number): PhigrosChallengeMode {
  const value = Number.isFinite(challengeModeRank) ? Math.max(0, Math.floor(challengeModeRank)) : 0;
  const level = Math.min(5, Math.floor(value / 100));
  const rank = value % 100;
  return { level, rank };
}

export function parseGameRecord(
  buf: ArrayBuffer | SharedArrayBuffer | Uint8Array,
): Record<string, (PhigrosScoreEntry | null)[]> {
  const r = new ByteReader(buf);
  const record: Record<string, (PhigrosScoreEntry | null)[]> = {};

  /** 首 varint 是 songsnum，常为 27；读取必须以 remaining 为准，不能只取 B27。 */
  if (r.remaining() > 0) {
    r.getVarInt();
  }

  /** phiTool GameRecord.read：varshort(keyLen)+utf8(keyLen−2)+校验2字节+u8(bodyLen)+body。 */
  while (r.remaining() > 0) {
    const entryStart = r.pos;
    try {
      const key = r.getGameRecordKey();
      if (!key || key.length > 128) break;

      const lengthBytePos = r.pos;
      const bodyLength = r.getByte();
      if (bodyLength <= 0 || r.remaining() < bodyLength) {
        r.pos = entryStart;
        break;
      }
      const nextPos = lengthBytePos + bodyLength + 1;

      const exist = r.getByte();
      const fcFlag = r.getByte();
      const levels: (PhigrosScoreEntry | null)[] = [null, null, null, null];

      for (let lv = 0; lv < 4; lv++) {
        if ((exist >> lv) & 1) {
          const score = r.getInt();
          const rawAcc = r.getFloat();
          const isFullCombo = (score === 1000000 && rawAcc >= 99.995) || !!((fcFlag >> lv) & 1);
          levels[lv] = {
            songId: key,
            level: lv as PhigrosLevel,
            difficulty: 0,
            score,
            rawAcc,
            acc: Math.round(rawAcc * 100) / 100,
            fc: isFullCombo,
            rks: 0,
          };
        }
      }

      r.pos = nextPos;
      record[key] = levels;
    } catch {
      r.pos = entryStart;
      break;
    }
  }

  return record;
}

/** 存档浮点 99.996 等值在游戏内显示为 100%。 */
export function isAcc100Percent(rawAcc: number): boolean {
  return rawAcc >= 99.995;
}

/** 评价算法对齐 phi-plugin fCompute.rate。 */
export const PHIGROS_MAX_SCORE = 1_000_000;

export function phigrosScoreToRate(
  score: number,
  fc: boolean,
  totalScore = PHIGROS_MAX_SCORE,
): string {
  if (score === totalScore) return 'phi';
  if (fc) return 'v';
  if (score >= totalScore * 0.96) return 'v';
  if (score >= totalScore * 0.92) return 's';
  if (score >= totalScore * 0.88) return 'a';
  if (score >= totalScore * 0.82) return 'b';
  if (score >= totalScore * 0.70) return 'c';
  if (score > 0) return 'f';
  return 'new';
}

/** rawAcc 单位为百分数；达到 100% 时成绩 RKS 等于谱面定数。 */
export function calculateRks(difficulty: number, rawAcc: number): number {
  if (rawAcc < 70) return 0;
  return difficulty * ((rawAcc - 55) / 45) ** 2;
}

export function roundRks(value: number): number {
  return Math.round(value * 10000) / 10000;
}

export function formatPhigrosSongRks(rks: number): string {
  return rks.toFixed(2);
}

/** Phi3 取 100% 谱面中定数最高的三张，贡献使用谱面定数。 */
export function selectPhi3(allRecords: PhigrosScoreEntry[]): PhigrosScoreEntry[] {
  return [...allRecords]
    .filter((r) => isAcc100Percent(r.rawAcc))
    .sort((a, b) => b.difficulty - a.difficulty)
    .slice(0, 3);
}

export function sumPhi3Contribution(allRecords: PhigrosScoreEntry[]): number {
  return selectPhi3(allRecords).reduce((sum, s) => sum + s.difficulty, 0);
}

export function collectScoredEntries(
  gameRecord: Record<string, (PhigrosScoreEntry | null)[]>,
  difficultyTable: PhigrosDifficultyTable,
): PhigrosScoreEntry[] {
  const allRecords: PhigrosScoreEntry[] = [];

  for (const [songId, levels] of Object.entries(gameRecord)) {
    const diffs = difficultyTable[songId];
    for (let lv = 0; lv < 4; lv++) {
      const entry = levels[lv];
      if (!entry) continue;
      const diff = diffs?.[lv] ?? 0;
      allRecords.push({
        ...entry,
        difficulty: diff,
        rks: diff > 0 ? calculateRks(diff, entry.rawAcc) : 0,
      });
    }
  }

  return allRecords;
}

export function toPhigrosScoreRecord(entry: PhigrosScoreEntry): PhigrosScoreRecord {
  return {
    songId: entry.songId,
    level: entry.level,
    difficultyConstant: entry.difficulty,
    score: entry.score,
    rawAcc: entry.rawAcc,
    acc: entry.acc,
    rks: entry.rks,
    fullCombo: entry.fc,
  };
}

/** 共享视图借用 dxScore 保存分数、fc=ap 表示满连；SD 不用于展示类型。 */
export function phigrosSharedScoreRecord(record: PhigrosScoreRecord): ScoreRecord {
  return {
    songId: record.songId,
    title: record.songId,
    type: 'SD',
    levelIndex: record.level,
    level: LEVEL_NAMES[record.level],
    difficulty: LEVEL_DIFFICULTY[record.level],
    difficultyConstant: record.difficultyConstant,
    achievements: record.acc,
    dxScore: record.score,
    rating: record.rks,
    fc: record.fullCombo ? 'ap' : null,
    fs: null,
    rate: phigrosScoreToRate(record.score, record.fullCombo),
    version: 'current',
  };
}

export function gameRecordToPhigrosScoreRecords(
  gameRecord: Record<string, (PhigrosScoreEntry | null)[]>,
  difficultyTable: PhigrosDifficultyTable,
): PhigrosScoreRecord[] {
  return collectScoredEntries(gameRecord, difficultyTable)
    .map(toPhigrosScoreRecord)
    .sort((a, b) => b.rks - a.rks || b.acc - a.acc);
}

export function gameRecordToScoreRecords(
  gameRecord: Record<string, (PhigrosScoreEntry | null)[]>,
  difficultyTable: PhigrosDifficultyTable,
): ScoreRecord[] {
  return gameRecordToPhigrosScoreRecords(gameRecord, difficultyTable).map(phigrosSharedScoreRecord);
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
    if (isAcc100Percent(song.rawAcc)) return { ...song, targetAccForPlusOne: null };

    const diff = song.difficulty;
    let low = Math.max(song.rawAcc, 70.01);
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
      if (isAcc100Percent(mid)) {
        const candidates = allRecords
          .map((r) => {
            if (r.songId === song.songId && r.level === song.level) {
              return { difficulty: diff, qualifies: isAcc100Percent(mid) };
            }
            return { difficulty: r.difficulty, qualifies: isAcc100Percent(r.rawAcc) };
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
  user: PhigrosUserProfile | null;
  gameProgress: PhigrosGameProgress | null;
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

  let user: PhigrosUserProfile | null = null;
  const userFile = zip.file('user');
  if (userFile) {
    try {
      const userBuf = await userFile.async('uint8array');
      if (userBuf.length > 1) user = parsePhigrosUser(decryptBytes(userBuf.subarray(1)));
    } catch {
      user = null;
    }
  }

  let gameProgress: PhigrosGameProgress | null = null;
  const progressFile = zip.file('gameProgress');
  if (progressFile) {
    try {
      const progressBuf = await progressFile.async('uint8array');
      if (progressBuf.length > 1) {
        gameProgress = parsePhigrosGameProgress(decryptBytes(progressBuf.subarray(1)));
      }
    } catch {
      gameProgress = null;
    }
  }

  return { gameRecord, user, gameProgress };
}

export function loadDifficultyTable(raw: string): PhigrosDifficultyTable {
  const table: PhigrosDifficultyTable = {};
  for (const line of raw.trim().split('\n')) {
    if (!line.trim()) continue;
    const cols = line.split('\t');
    const id = cols[0];
    if (!id) continue;
    const vals = cols.slice(1).map((c) => (c === '' ? 0 : Number(c)));
    while (vals.length < 4) vals.push(0);
    table[id] = vals;
  }
  return table;
}

export function normalizePhigrosSongId(chartSongId: string): string {
  return chartSongId.replace(/\.0$/, '');
}

function parseNoteCountsCell(raw: string): PhigrosChartNotes | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length !== 4) return null;
    const [tap, hold, drag, flick] = parsed;
    if (![tap, hold, drag, flick].every((n) => Number.isInteger(n) && (n as number) >= 0)) {
      return null;
    }
    return {
      tap: tap as number,
      hold: hold as number,
      drag: drag as number,
      flick: flick as number,
      total: (tap as number) + (hold as number) + (drag as number) + (flick as number),
    };
  } catch {
    return null;
  }
}

/** note_counts.tsv 列为 songId、EZ、HD、IN、可选 AT；每格为 [Tap,Hold,Drag,Flick]。 */
export function loadNoteCountsTable(raw: string): Record<string, PhigrosChartNotes[]> {
  const table: Record<string, PhigrosChartNotes[]> = {};
  for (const line of raw.trim().split('\n')) {
    if (!line.trim()) continue;
    const cols = line.split('\t');
    const chartSongId = cols[0];
    if (!chartSongId) continue;
    const notes: PhigrosChartNotes[] = [];
    for (const cell of cols.slice(1)) {
      if (!cell) break;
      const parsed = parseNoteCountsCell(cell);
      if (!parsed) break;
      notes.push(parsed);
    }
    if (notes.length === 0) continue;
    table[normalizePhigrosSongId(chartSongId)] = notes;
  }
  return table;
}

export interface PhigrosChapterDefinition {
  key: string;
  title: string;
}

export interface PhigrosChaptersTable {
  definitions: PhigrosChapterDefinition[];
  songChapter: Record<string, string>;
}

/** chapters.csv 以 # 歌曲章节映射：songId,章节变量 分隔定义与映射。 */
export function loadChaptersTable(raw: string): PhigrosChaptersTable | null {
  const lines = raw.replace(/^\uFEFF/, '').split(/\r?\n/);
  const definitions: PhigrosChapterDefinition[] = [];
  const definitionKeys = new Set<string>();
  const songChapter: Record<string, string> = {};
  let inMapping = false;
  let sawMappingMarker = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      if (trimmed.startsWith('#') && trimmed.includes('songId')) {
        inMapping = true;
        sawMappingMarker = true;
      }
      continue;
    }
    const cols = line.split(',');
    const first = cols[0]?.trim() ?? '';
    if (!first) continue;

    if (!inMapping) {
      if (definitionKeys.has(first)) continue;
      definitionKeys.add(first);
      definitions.push({ key: first, title: cols.slice(1).join(',').trim() });
      continue;
    }

    const key = cols.slice(1).join(',').trim();
    if (!key || !definitionKeys.has(key)) continue;
    songChapter[normalizePhigrosSongId(first)] = key;
  }

  if (definitions.length === 0 || !sawMappingMarker) return null;
  return { definitions, songChapter };
}

/** 同曲定数优先保留先出现的版本。 */
export function mergeDifficultyTables(
  primary: PhigrosDifficultyTable,
  ...fallbacks: PhigrosDifficultyTable[]
): PhigrosDifficultyTable {
  const merged: PhigrosDifficultyTable = { ...primary };
  for (const table of fallbacks) {
    for (const [id, diffs] of Object.entries(table)) {
      if (!merged[id]) merged[id] = diffs;
    }
  }
  return merged;
}
