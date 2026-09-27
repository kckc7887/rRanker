import { describe, expect, it } from 'vitest';
import {
  PHIGROS_MAX_SCORE,
  gameRecordToPhigrosScoreRecords,
  loadDifficultyTable,
  phigrosSharedScoreRecord,
  toPhigrosScoreRecord,
  type PhigrosDifficultyTable,
  type PhigrosScoreEntry,
} from '@/domain/phigros';
import type { ScoreRecord } from '@/domain/models';
import { presentPhigrosScore } from '@/features/game-content/adapters/phigros';

const entry: PhigrosScoreEntry = {
  songId: 'Glaciaxion.SunsetRay',
  level: 2,
  difficulty: 15.5,
  score: 995_000,
  rawAcc: 99.5,
  acc: 99.5,
  fc: true,
  rks: 15.2,
};

/** 共享成绩卡（ScoreRecord）视图的既定形状：舞萌语义字段只在此边界借用。 */
const sharedView: ScoreRecord = {
  songId: 'Glaciaxion.SunsetRay',
  title: 'Glaciaxion.SunsetRay',
  type: 'SD',
  levelIndex: 2,
  level: 'IN',
  difficulty: 'expert',
  difficultyConstant: 15.5,
  achievements: 99.5,
  dxScore: 995_000,
  rating: 15.2,
  fc: 'ap',
  fs: null,
  rate: 'v',
  version: 'current',
};

describe('Phigros 领域成绩记录', () => {
  it('生产映射只保留真实语义，不填 DX/SD/fs 占位', () => {
    const record = toPhigrosScoreRecord(entry);

    expect(record).toEqual({
      songId: 'Glaciaxion.SunsetRay',
      level: 2,
      difficultyConstant: 15.5,
      score: 995_000,
      rawAcc: 99.5,
      acc: 99.5,
      rks: 15.2,
      fullCombo: true,
    });
    expect(Object.keys(record).sort()).toEqual([
      'acc', 'difficultyConstant', 'fullCombo', 'level', 'rawAcc', 'rks', 'score', 'songId',
    ]);
    expect(record).not.toHaveProperty('type');
    expect(record).not.toHaveProperty('dxScore');
    expect(record).not.toHaveProperty('fs');
    expect(record).not.toHaveProperty('fc');
  });

  it('全谱成绩映射为真实记录并按成绩 RKS 降序', () => {
    const gameRecord = {
      'Slow.Song': [
        null,
        null,
        {
          songId: 'Slow.Song', level: 2 as const, difficulty: 0,
          score: 900_000, rawAcc: 95, acc: 95, fc: false, rks: 0,
        },
        null,
      ],
      'Fast.Song': [
        null,
        null,
        {
          songId: 'Fast.Song', level: 2 as const, difficulty: 0,
          score: 1_000_000, rawAcc: 100, acc: 100, fc: true, rks: 0,
        },
        null,
      ],
    };
    const table: PhigrosDifficultyTable = loadDifficultyTable('Slow.Song\t1\t1\t10\nFast.Song\t1\t1\t16\n');

    const records = gameRecordToPhigrosScoreRecords(gameRecord, table);

    expect(records.map((record) => record.songId)).toEqual(['Fast.Song', 'Slow.Song']);
    expect(records[0]).toEqual({
      songId: 'Fast.Song', level: 2, difficultyConstant: 16,
      score: 1_000_000, rawAcc: 100, acc: 100, rks: 16, fullCombo: true,
    });
    expect(records[1]?.fullCombo).toBe(false);
    expect(records[1]?.rks).toBeGreaterThan(0);
    expect(records.some((record) => 'dxScore' in record)).toBe(false);
  });

  it('共享成绩卡视图保持既定分数、FC 与路由', () => {
    const shared = phigrosSharedScoreRecord(toPhigrosScoreRecord(entry));

    expect(shared).toEqual(sharedView);

    const card = presentPhigrosScore(shared);
    expect(card.route).toEqual({ songId: 'Glaciaxion.SunsetRay', levelIndex: 2 });
    expect(card.primaryMetric).toEqual({
      key: 'score',
      label: 'Score',
      text: '995,000',
      effect: 'flowing-gradient',
      tone: 'fc',
    });
    expect(card.secondaryMetrics).toEqual([
      { key: 'accuracy', text: '99.50%' },
      { key: 'rks', text: '15.20', tone: 'accent' },
    ]);
    expect(card.grade).toEqual({ key: 'rate', label: 'v', tone: 'v' });
    expect(card.difficulty.value).toBe('15.5');
  });

  it('满分成绩仍是 φ 并走 phi 语气', () => {
    const phiEntry: PhigrosScoreEntry = {
      ...entry, score: PHIGROS_MAX_SCORE, rawAcc: 100, acc: 100, fc: true, rks: 15.5,
    };
    const record = toPhigrosScoreRecord(phiEntry);
    expect(record.score).toBe(1_000_000);
    expect(record.fullCombo).toBe(true);

    const card = presentPhigrosScore(phigrosSharedScoreRecord(record));
    expect(card.primaryMetric.text).toBe('1,000,000');
    expect(card.primaryMetric.tone).toBe('phi');
    expect(card.grade).toEqual({ key: 'rate', label: 'phi', tone: 'phi' });
  });

  it('非 FC 成绩不冒充满连', () => {
    const noFc: PhigrosScoreEntry = { ...entry, fc: false, rks: 14.1 };
    const record = toPhigrosScoreRecord(noFc);
    expect(record.fullCombo).toBe(false);
    expect(phigrosSharedScoreRecord(record).fc).toBeNull();
  });
});
