import type { CatalogSnapshot, ScoreRecord, Song } from '@/domain/models';
import {
  chartPickKey,
  filterMaimaiRandomCharts,
  filterPhigrosRandomCharts,
  pickRandomItems,
  type MaimaiRandomChartFilters,
  type PhigrosRandomChartFilters,
} from '@/domain/random-charts';
import { fixtureSource } from '@/fixtures/sanitized';

const songs: Song[] = [
  {
    id: '1',
    title: '曲目甲',
    artist: '艺术家甲',
    version: '测试版本',
    charts: [
      { songId: '1', type: 'DX', levelIndex: 2, level: '12', difficulty: 'expert', difficultyConstant: 12, versionId: 1 },
      { songId: '1', type: 'DX', levelIndex: 3, level: '13+', difficulty: 'master', difficultyConstant: 13.5, versionId: 1 },
      { songId: '1', type: 'DX', levelIndex: 4, level: '14', difficulty: 'remaster', difficultyConstant: 14.2, versionId: 2 },
    ],
  },
  {
    id: '2',
    title: '曲目乙',
    artist: '艺术家乙',
    version: '旧版本',
    charts: [
      { songId: '2', type: 'SD', levelIndex: 1, level: '10', difficulty: 'advanced', difficultyConstant: 10, versionId: 1 },
      { songId: '2', type: 'SD', levelIndex: 3, level: '13', difficulty: 'master', difficultyConstant: 13, versionId: 1 },
    ],
  },
  {
    id: '3',
    title: '曲目丙',
    version: '旧版本',
    charts: [
      { songId: '3', type: 'DX', levelIndex: 0, level: '7', difficulty: 'basic', difficultyConstant: 7, versionId: 1 },
    ],
  },
  {
    id: '100123',
    title: 'U·TA·GE',
    version: '测试版本',
    charts: [
      { songId: '100123', type: 'UTAGE', levelIndex: 0, level: '宴', difficulty: 'utage', difficultyConstant: 0, versionId: 2 },
    ],
  },
];

const catalog: CatalogSnapshot = {
  currentVersion: { id: 2, title: '测试版本' },
  versions: [{ id: 1, title: '旧版本' }, { id: 2, title: '测试版本' }],
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
    fc: 'ap',
    fs: null,
    rate: 'ss',
    version: '旧版本',
  },
  {
    songId: '2',
    title: '曲目乙',
    type: 'SD',
    levelIndex: 1,
    level: '10',
    difficulty: 'advanced',
    difficultyConstant: 10,
    achievements: 98,
    dxScore: null,
    rating: 150,
    fc: 'fc',
    fs: 'fs',
    rate: 's',
    version: '旧版本',
  },
];

const maimaiFilters: MaimaiRandomChartFilters = {
  difficulty: 'all',
  version: 'all',
  type: 'all',
  constantMin: '',
  constantMax: '',
  achievementMin: '',
  achievementMax: '',
  soloAchievement: null,
  multiAchievement: null,
};

describe('filterMaimaiRandomCharts', () => {
  it('uses the full catalog and includes unplayed and U·TA·GE charts by default', () => {
    const pool = filterMaimaiRandomCharts(catalog, records, maimaiFilters);
    expect(pool).toHaveLength(7);
    expect(pool.some((item) => !item.played)).toBe(true);
    expect(pool.some((item) => item.type === 'UTAGE')).toBe(true);
  });

  it('matches difficulty, chart version, type and constant against catalog charts', () => {
    const pool = filterMaimaiRandomCharts(catalog, records, {
      ...maimaiFilters,
      difficulty: 'master',
      version: '旧版本',
      type: 'DX',
      constantMin: '13',
      constantMax: '14',
    });
    expect(pool.map(chartPickKey)).toEqual(['1:DX:3']);
  });

  it('excludes U·TA·GE when a constant bound is entered like the records page', () => {
    const pool = filterMaimaiRandomCharts(catalog, records, {
      ...maimaiFilters,
      difficulty: 'utage',
      constantMin: '0',
    });
    expect(pool).toEqual([]);
  });

  it('requires records only when achievement filters are valid and active', () => {
    const filtered = filterMaimaiRandomCharts(catalog, records, {
      ...maimaiFilters,
      achievementMin: '98.5',
    });
    expect(filtered.map(chartPickKey)).toEqual(['1:DX:3']);

    const invalid = filterMaimaiRandomCharts(catalog, records, {
      ...maimaiFilters,
      achievementMin: 'invalid',
    });
    expect(invalid).toHaveLength(7);
  });

  it('uses the same strict solo and multi achievement matching as records', () => {
    const solo = filterMaimaiRandomCharts(catalog, records, {
      ...maimaiFilters,
      soloAchievement: 'ap',
    });
    const multi = filterMaimaiRandomCharts(catalog, records, {
      ...maimaiFilters,
      multiAchievement: 'fs',
    });
    expect(solo.map(chartPickKey)).toEqual(['1:DX:3']);
    expect(multi.map(chartPickKey)).toEqual(['2:SD:1']);
  });
});

describe('pickRandomItems', () => {
  const values = ['a', 'b', 'c', 'd', 'e'];

  it('is deterministic, unique and clamps count into 1-4', () => {
    expect(pickRandomItems(values, 3, 'fixed')).toEqual(pickRandomItems(values, 3, 'fixed'));
    expect(new Set(pickRandomItems(values, 4, 'unique')).size).toBe(4);
    expect(pickRandomItems(values, 99, 'high')).toHaveLength(4);
    expect(pickRandomItems(values, 0, 'low')).toHaveLength(1);
  });

  it('returns all candidates when the requested count exceeds the pool', () => {
    expect(pickRandomItems(['only'], 4, 'small')).toEqual(['only']);
    expect(pickRandomItems([], 4, 'empty')).toEqual([]);
  });
});

describe('filterPhigrosRandomCharts', () => {
  const phigrosCatalog: CatalogSnapshot = {
    currentVersion: { id: 0, title: 'test' },
    versions: [{ id: 0, title: 'test' }],
    source: fixtureSource,
    chartVersionIndex: {},
    songs: [{
      id: 'song',
      title: 'Song',
      version: 'test',
      charts: [
        { songId: 'song', type: 'SD', levelIndex: 0, level: '1', difficulty: 'basic', difficultyConstant: 1 },
        { songId: 'song', type: 'SD', levelIndex: 2, level: '12', difficulty: 'expert', difficultyConstant: 12.3 },
        { songId: 'song', type: 'SD', levelIndex: 3, level: '15', difficulty: 'master', difficultyConstant: 15.4 },
      ],
    }],
  };
  const phigrosRecords: ScoreRecord[] = [{
    songId: 'song',
    title: 'Song',
    type: 'SD',
    levelIndex: 2,
    level: '12',
    difficulty: 'expert',
    difficultyConstant: 12.3,
    achievements: 99.65,
    dxScore: 980000,
    rating: 12,
    fc: null,
    fs: null,
    rate: 'v',
    version: 'test',
  }];
  const filters: PhigrosRandomChartFilters = {
    level: 'all',
    constantMin: '',
    constantMax: '',
    accuracyMin: '',
    accuracyMax: '',
    rank: null,
    xing: null,
  };

  it('keeps unplayed catalog charts under basic filters', () => {
    const pool = filterPhigrosRandomCharts(
      phigrosCatalog,
      phigrosRecords,
      { ...filters, level: 3, constantMin: '15' },
      {},
    );
    expect(pool).toHaveLength(1);
    expect(pool[0]?.played).toBe(false);
  });

  it('requires a score for Acc, rank and XING filters', () => {
    const accuracy = filterPhigrosRandomCharts(
      phigrosCatalog,
      phigrosRecords,
      { ...filters, accuracyMin: '99' },
      {},
    );
    const rank = filterPhigrosRandomCharts(
      phigrosCatalog,
      phigrosRecords,
      { ...filters, rank: 'v' },
      {},
    );
    const xing = filterPhigrosRandomCharts(
      phigrosCatalog,
      phigrosRecords,
      { ...filters, xing: 'good' },
      { 'song:2': 100 },
    );
    expect(accuracy.map(chartPickKey)).toEqual(['song:SD:2']);
    expect(rank.map(chartPickKey)).toEqual(['song:SD:2']);
    expect(xing.map(chartPickKey)).toEqual(['song:SD:2']);
  });
});
