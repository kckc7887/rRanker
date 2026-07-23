import type { CatalogSnapshot, ScoreRecord, Song } from '@/domain/models';
import {
  chartPickKey,
  filterRandomCharts,
  pickRandomCharts,
  type RandomChartFilters,
} from '@/domain/random-charts';
import { fixtureSource } from '@/fixtures/sanitized';

const songs: Song[] = [
  {
    id: '1',
    title: '曲目甲',
    artist: '艺术家甲',
    version: '测试版本',
    charts: [
      { songId: '1', type: 'DX', levelIndex: 2, level: '12', difficulty: 'expert', difficultyConstant: 12.0 },
      { songId: '1', type: 'DX', levelIndex: 3, level: '13+', difficulty: 'master', difficultyConstant: 13.5 },
      { songId: '1', type: 'DX', levelIndex: 4, level: '14', difficulty: 'remaster', difficultyConstant: 14.2 },
    ],
  },
  {
    id: '2',
    title: '曲目乙',
    artist: '艺术家乙',
    version: '测试版本',
    charts: [
      { songId: '2', type: 'SD', levelIndex: 1, level: '10', difficulty: 'advanced', difficultyConstant: 10.0 },
      { songId: '2', type: 'SD', levelIndex: 3, level: '13', difficulty: 'master', difficultyConstant: 13.0 },
    ],
  },
  {
    id: '3',
    title: '曲目丙',
    version: '测试版本',
    charts: [
      { songId: '3', type: 'DX', levelIndex: 0, level: '7', difficulty: 'basic', difficultyConstant: 7.0 },
    ],
  },
];

const catalog: CatalogSnapshot = {
  currentVersion: { id: 1, title: '测试版本' },
  versions: [{ id: 1, title: '测试版本' }],
  songs,
  chartVersionIndex: {},
  source: fixtureSource,
};

const records: ScoreRecord[] = [
  {
    songId: '1',
    title: '曲目甲',
    type: 'DX',
    levelIndex: 3,
    level: '13+',
    difficulty: 'master',
    difficultyConstant: 13.5,
    achievements: 99,
    dxScore: 1000,
    rating: 200,
    fc: null,
    fs: null,
    rate: 'ss',
    version: '测试版本',
  },
  {
    songId: '2',
    title: '曲目乙',
    type: 'SD',
    levelIndex: 1,
    level: '10',
    difficulty: 'advanced',
    difficultyConstant: 10.0,
    achievements: 98,
    dxScore: null,
    rating: 150,
    fc: 'fc',
    fs: null,
    rate: 's',
    version: '测试版本',
  },
];

const allFilters: RandomChartFilters = {
  difficulties: [],
  constantMin: '',
  constantMax: '',
  played: 'all',
};

describe('filterRandomCharts', () => {
  it('returns every chart when filters are open', () => {
    const pool = filterRandomCharts(catalog, records, allFilters);
    expect(pool).toHaveLength(6);
  });

  it('filters by difficulty multi-select', () => {
    const pool = filterRandomCharts(catalog, records, {
      ...allFilters,
      difficulties: ['master', 'remaster'],
    });
    expect(pool.map((item) => item.difficulty).sort()).toEqual(['master', 'master', 'remaster']);
  });

  it('filters by constant range', () => {
    const pool = filterRandomCharts(catalog, records, {
      ...allFilters,
      constantMin: '13',
      constantMax: '13.5',
    });
    expect(pool.map((item) => item.difficultyConstant).sort()).toEqual([13, 13.5]);
  });

  it('filters played and unplayed charts', () => {
    const played = filterRandomCharts(catalog, records, { ...allFilters, played: 'played' });
    const unplayed = filterRandomCharts(catalog, records, { ...allFilters, played: 'unplayed' });
    expect(played.map(chartPickKey).sort()).toEqual(['1:DX:3', '2:SD:1']);
    expect(unplayed).toHaveLength(4);
    expect(unplayed.every((item) => !item.played)).toBe(true);
  });

  it('marks played status on each pick', () => {
    const pool = filterRandomCharts(catalog, records, allFilters);
    const master = pool.find((item) => item.songId === '1' && item.levelIndex === 3);
    const remaster = pool.find((item) => item.songId === '1' && item.levelIndex === 4);
    expect(master?.played).toBe(true);
    expect(remaster?.played).toBe(false);
  });
});

describe('pickRandomCharts', () => {
  it('returns an empty list when the pool is empty', () => {
    const picked = pickRandomCharts({
      catalog,
      records,
      filters: { ...allFilters, constantMin: '20', constantMax: '21' },
      count: 3,
      seed: 'empty',
    });
    expect(picked).toEqual([]);
  });

  it('returns the whole pool when count exceeds pool size', () => {
    const picked = pickRandomCharts({
      catalog,
      records,
      filters: { ...allFilters, difficulties: ['basic'] },
      count: 4,
      seed: 'small-pool',
    });
    expect(picked).toHaveLength(1);
    expect(picked[0]?.difficulty).toBe('basic');
  });

  it('is reproducible for the same seed', () => {
    const input = {
      catalog,
      records,
      filters: allFilters,
      count: 3 as const,
      seed: 'fixed-seed',
    };
    const first = pickRandomCharts(input);
    const second = pickRandomCharts(input);
    expect(first.map(chartPickKey)).toEqual(second.map(chartPickKey));
  });

  it('does not repeat charts within one draw', () => {
    const picked = pickRandomCharts({
      catalog,
      records,
      filters: allFilters,
      count: 4,
      seed: 'no-dupes',
    });
    expect(new Set(picked.map(chartPickKey)).size).toBe(picked.length);
  });

  it('clamps count into 1-4', () => {
    const over = pickRandomCharts({
      catalog,
      records,
      filters: allFilters,
      count: 99,
      seed: 'clamp-high',
    });
    const under = pickRandomCharts({
      catalog,
      records,
      filters: allFilters,
      count: 0,
      seed: 'clamp-low',
    });
    expect(over).toHaveLength(4);
    expect(under).toHaveLength(1);
  });
});
