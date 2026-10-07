import { analyzeMaimaiStrength, buildMaimaiStrengthPool } from '@/domain/maimai-strength-analysis';
import { chartVersionKey } from '@/domain/catalog';
import type { CatalogSnapshot, ScoreRecord } from '@/domain/models';
import type { MaimaiDxTagScores } from '@/domain/maimai-dxtag';

function record(id: number, overrides: Partial<ScoreRecord> = {}): ScoreRecord {
  return { songId: String(id), title: `Song ${id}`, type: 'SD', levelIndex: 3, level: '13',
    difficulty: 'master', difficultyConstant: 13, achievements: 100, rating: 280,
    dxScore: null, fc: null, fs: null, rate: 'sss', version: 'current', ...overrides };
}
function catalog(records: ScoreRecord[], disabled = false): CatalogSnapshot {
  return { currentVersion: { id: 1, title: 'current' }, versions: [], chartVersionIndex: {},
    source: { kind: 'lxns', label: 'LXNS', updatedAt: '', isStale: false },
    songs: records.map(item => ({ id: item.songId, title: item.title, version: 'current', disabled, charts: [item] })) };
}
const key = (item: ScoreRecord) => chartVersionKey(item.songId, item.type, item.levelIndex);
function features(records: ScoreRecord[], scores: MaimaiDxTagScores = [4, 5, 6, 7, 8]) {
  return new Map(records.map(item => [key(item), scores]));
}

describe('Maimai strength analysis', () => {
  it('deduplicates best achievements while preserving SD/DX and excluding incomplete/utage records', () => {
    const sd = record(1);
    const dx = record(10001, { type: 'DX' });
    const records = [sd, record(1, { achievements: 99 }), dx,
      record(1, { achievements: 101, incomplete: true }), record(2, { type: 'UTAGE' })];
    const result = analyzeMaimaiStrength(catalog(records), records, features(records), 100);
    expect(result.axes[0].samples.map(item => item.record)).toEqual([sd, dx].sort((a, b) => key(a).localeCompare(key(b))));
    expect(result.sufficient).toBe(false);
    expect(result.recommendations).toEqual([]);
  });

  it.each([99, 100, 100.5] as const)('includes the exact %s target and excludes the score immediately below it', target => {
    const records = [record(1, { achievements: target }), record(2, { achievements: target - 0.0001 })];
    expect(analyzeMaimaiStrength(catalog(records), records, features(records), target).axes[0].samples.map(item => item.record.songId)).toEqual(['1']);
  });

  it('selects an independent top ten per axis, averages actual samples and sorts tied features by achievement', () => {
    const records = Array.from({ length: 11 }, (_, i) => record(i + 1));
    records[4].achievements = 100.5;
    const tags = new Map(records.map((item, i) => [key(item), [i, 10 - i, 5, 0, 0] as MaimaiDxTagScores]));
    const result = analyzeMaimaiStrength(catalog(records), records, tags, 100);
    expect(result.axes[0].value).toBe(5.5);
    expect(result.axes[0].samples[0].record.songId).toBe('11');
    expect(result.axes[1].samples[0].record.songId).toBe('1');
    expect(result.axes[2].samples).toHaveLength(10);
    expect(result.axes[2].samples[0].record.songId).toBe('5');
    expect(result.axes[3].value).toBeNull();
    expect(result.axes[3].samples).toEqual([]);
    expect(result.sufficient).toBe(false);
    expect(analyzeMaimaiStrength(catalog(records), records, new Map(), 100).axes.every(axis => axis.value === null)).toBe(true);
  });

  it('requires three samples per axis and includes equality at the balanced boundary', () => {
    const records = [record(1), record(2), record(3)];
    const result = analyzeMaimaiStrength(catalog(records), records, features(records, [5, 5.3, 5, 5.3, 5]), 100);
    expect(result.conclusion).toBe('五维较均衡');
    const uneven = analyzeMaimaiStrength(catalog(records), records, features(records, [4, 4, 6, 8, 8]), 100);
    expect(uneven.conclusion).toBe('相对擅长：体力、爆发 · 相对薄弱：键盘、星星');
    expect(analyzeMaimaiStrength(catalog(records), records.slice(0, 2), features(records), 100).sufficient).toBe(false);
  });

  it('uses the ten highest mastered constants and includes both candidate boundaries', () => {
    const records = Array.from({ length: 11 }, (_, i) => record(i + 1, { difficultyConstant: i === 0 ? 8 : 13 }));
    const candidates = [record(20, { difficultyConstant: 12.5 }), record(21, { difficultyConstant: 13.3 }),
      record(22, { difficultyConstant: 12.4 }), record(23, { difficultyConstant: 13.4 }),
      record(24, { difficultyConstant: 0 }), record(25, { type: 'UTAGE' })];
    const pool = buildMaimaiStrengthPool(catalog([...records, ...candidates]), records, 100);
    expect(pool.baseline).toBe(13);
    expect(pool.candidates.map(item => item.songId)).toEqual(['20', '21']);
    expect(buildMaimaiStrengthPool(catalog(candidates, true), records, 100).candidates).toEqual([]);
  });

  it('recommends positive gains on weak axes including ties and ranks played charts before unplayed ties', () => {
    const mastered = [record(1), record(2), record(3)];
    const candidates = [record(10), record(11), record(12), record(13), record(14)];
    const played = [...mastered, record(11, { achievements: 99 })];
    const tags = features(mastered, [4, 5, 5, 8, 8]);
    tags.set(key(candidates[0]), [8, 5, 5, 8, 8]);
    tags.set(key(candidates[1]), [8, 5, 5, 8, 8]);
    tags.set(key(candidates[2]), [4, 5, 9, 8, 8]);
    tags.set(key(candidates[3]), [4, 5, 5, 10, 10]);
    const result = analyzeMaimaiStrength(catalog([...mastered, ...candidates, candidates[0]]), played, tags, 100);
    expect(result.recommendations.map(item => item.chart.songId)).toEqual(['11', '10', '12']);
    expect(result.recommendations[0].gain).toBeCloseTo(1 / 3);
    expect(result.recommendations[2].axes).toEqual(['技巧']);
    expect(result.recommendations[0].record?.achievements).toBe(99);
  });

  it('simulates replacement in a full top ten and considers all axes when balanced', () => {
    const mastered = Array.from({ length: 10 }, (_, i) => record(i + 1));
    const candidate = record(30);
    const tags = features(mastered, [5, 5, 5, 5, 5]);
    tags.set(key(candidate), [5, 5, 5, 5, 7]);
    const result = analyzeMaimaiStrength(catalog([...mastered, candidate]), mastered, tags, 100);
    expect(result.recommendations[0].gain).toBeCloseTo(0.04);
    expect(result.recommendations[0].axes).toEqual(['爆发']);
    tags.set(key(candidate), [5, 5, 5, 5, 5]);
    expect(analyzeMaimaiStrength(catalog([...mastered, candidate]), mastered, tags, 100).recommendations).toEqual([]);
  });
});
