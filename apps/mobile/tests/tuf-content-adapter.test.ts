import { describe, expect, it } from 'vitest';
import passPage from './fixtures/tuf/pass-page.sanitized.json';
import levelPage from './fixtures/tuf/level-page.sanitized.json';
import { TufLevelPageSchema, TufPassPageSchema } from '@/domain/tuf';
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
    expect(presentTufLevel(sparse).chartBadges[0]).toMatchObject({ label: 'Legacy 12', tone: 'legacy' });
  });
});
