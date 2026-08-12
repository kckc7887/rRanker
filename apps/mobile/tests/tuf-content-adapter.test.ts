import { describe, expect, it } from 'vitest';
import passPage from './fixtures/tuf/pass-page.sanitized.json';
import levelPage from './fixtures/tuf/level-page.sanitized.json';
import {
  filterTufPasses, tufDifficultyBounds, tufPguRange, TufLevelPageSchema, TufPassPageSchema,
  type TufPass,
} from '@/domain/tuf';
import { adofaiContentAdapter, presentTufChart, presentTufLevel, presentTufScore } from '@/features/game-content/adapters';

describe('ADOFAI TUF content adapter', () => {
  const pass = TufPassPageSchema.parse(passPage).passes[0];
  const level = pass.level;

  it('maps every level to one song/chart identity without a personal library key', () => {
    const song = adofaiContentAdapter.normalizeSong(level);
    expect(song).toMatchObject({ gameId: 'adofai', songId: '11372', charts: [{ chartId: '11372', order: 0 }] });
    expect(song.charts[0].libraryRef).toBeUndefined();
    expect(song.extension.upstreamSongId).toBe(401);
  });

  it('preserves Score V2, accuracy, speed, judgements, WF/PP and duplicate flags', () => {
    const score = adofaiContentAdapter.normalizeScore(pass);
    expect(score.extension).toMatchObject({ scoreV2: 101.25, accuracy: 100, speed: 1.5, isWorldsFirst: true, isWorldsFirstPP: false, isDuplicate: false });
    expect(score.extension.judgements?.perfect).toBe(421);
    expect(score.libraryRef).toBeUndefined();
  });

  it('builds dynamic note and presentation contracts for full and missing level fields', () => {
    expect(adofaiContentAdapter.normalizeChart(level).notes[0].values).toEqual([{ key: 'tiles', label: '物量', value: 421 }]);
    expect(presentTufScore(pass).primaryMetric.text).toBe('101.25');
    expect(presentTufLevel(level).route.songId).toBe('11372');
    expect(presentTufChart(level, pass).achievementRows.flat().some((badge) => badge.key === 'wf')).toBe(true);
    const sparse = TufLevelPageSchema.parse(levelPage).results[0];
    expect(adofaiContentAdapter.normalizeChart(sparse).notes).toEqual([]);
    expect(presentTufLevel(sparse).chartBadges[0]).toMatchObject({ label: 'Legacy 12', tone: 'tuf-legacy' });
  });

  it('normalizes the shared 1-20 range and builds band-aware server ranges', () => {
    expect(tufDifficultyBounds('', '')).toEqual({ min: 1, max: 20 });
    expect(tufDifficultyBounds('18', '5')).toEqual({ min: 5, max: 18 });
    expect(tufDifficultyBounds('0', '99')).toEqual({ min: 1, max: 20 });
    expect(tufPguRange({ band: 'all', min: 5, max: 18 })).toBe('P5,U18');
    expect(tufPguRange({ band: 'G', min: 5, max: 18 })).toBe('G5,G18');
  });

  it('filters records by PGU band, numeric range, special difficulty and WF/PP', () => {
    const makePass = (id: number, difficulty: string, achievements: Partial<TufPass> = {}) => ({
      ...pass,
      isWorldsFirst: false,
      isWorldsFirstPP: false,
      ...achievements,
      id,
      level: { ...pass.level, difficulty: { ...pass.level.difficulty!, name: difficulty } },
    }) as TufPass;
    const records = [
      makePass(1, 'P4', { isWorldsFirst: true }),
      makePass(2, 'G12', { isWorldsFirstPP: true }),
      makePass(3, 'U18'),
      makePass(4, 'Unranked', { isWorldsFirst: true, isWorldsFirstPP: true }),
    ];
    expect(filterTufPasses(records, { band: 'G', min: 10, max: 15, includeSpecial: false }))
      .toEqual([records[1]]);
    expect(filterTufPasses(records, { band: 'all', min: 1, max: 20, includeSpecial: true }, 'wf'))
      .toEqual([records[0], records[3]]);
    expect(filterTufPasses(records, { band: 'all', min: 1, max: 20, includeSpecial: false }, 'pp'))
      .toEqual([records[1]]);
  });
});
