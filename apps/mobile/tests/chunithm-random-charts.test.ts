import type { ChunithmCatalogSnapshot } from '@/domain/chunithm';
import {
  chunithmRandomChartKey,
  filterChunithmRandomCharts,
  type ChunithmRandomChartFilters,
} from '@/domain/chunithm-random-charts';
import type { ChunithmScoreCardData } from '@/domain/chunithm-score-presentation';
import { fixtureSource } from '@/fixtures/sanitized';

const catalog: ChunithmCatalogSnapshot = {
  currentVersion: { id: 2, title: 'NEW' },
  versions: [{ id: 1, title: 'OLD' }, { id: 2, title: 'NEW' }],
  genres: [],
  source: fixtureSource,
  songs: [{
    id: 1,
    title: 'Chuni Song',
    genre: 'POPS',
    bpm: 180,
    versionId: 1,
    versionTitle: 'OLD',
    locked: false,
    disabled: false,
    difficulties: [
      { difficulty: 3, level: '13', levelValue: 13, versionId: 1, versionTitle: 'OLD' },
      { difficulty: 4, level: '14+', levelValue: 14.7, versionId: 2, versionTitle: 'NEW' },
      { difficulty: 5, level: '狂☆3', levelValue: 0, versionId: 2, versionTitle: 'NEW', kanji: '狂', star: 3 },
    ],
  }],
};

const record: ChunithmScoreCardData = {
  key: '1-3',
  songId: '1',
  title: 'Chuni Song',
  levelIndex: 3,
  score: 1_009_000,
  rank: 'SSS+',
  clear: 'clear',
};

const filters: ChunithmRandomChartFilters = {
  difficulty: 'all',
  version: 'all',
  constantMin: '',
  constantMax: '',
  rankMin: null,
  rankMax: null,
};

describe('filterChunithmRandomCharts', () => {
  it('filters the full catalog by difficulty and chart version', () => {
    const pool = filterChunithmRandomCharts(catalog, [record], {
      ...filters,
      difficulty: 4,
      version: '2',
    });
    expect(pool).toHaveLength(1);
    expect(pool[0]?.record).toBeUndefined();
  });

  it("keeps WORLD'S END without constants and excludes it with a constant range", () => {
    const worldsEnd = filterChunithmRandomCharts(catalog, [record], {
      ...filters,
      difficulty: 5,
    });
    const ranged = filterChunithmRandomCharts(catalog, [record], {
      ...filters,
      difficulty: 5,
      constantMin: '1',
    });
    expect(worldsEnd[0]?.worldsEndLabel).toBe('狂☆3');
    expect(ranged).toEqual([]);
  });

  it('requires an existing score when a rank bound is active', () => {
    const pool = filterChunithmRandomCharts(catalog, [record], {
      ...filters,
      rankMin: 'SSS',
    });
    expect(pool.map(chunithmRandomChartKey)).toEqual(['1-3']);
    expect(pool[0]?.record).toBe(record);
  });

  it('returns no candidates for a reversed rank interval', () => {
    expect(filterChunithmRandomCharts(catalog, [record], {
      ...filters,
      rankMin: 'SSS+',
      rankMax: 'S',
    })).toEqual([]);
  });
});
