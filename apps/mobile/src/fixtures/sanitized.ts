import { chartVersionKey } from '@/domain/catalog';
import type { CatalogSnapshot, DataSource, Player, ScoreRecord, Song } from '@/domain/models';
import { calculateChartRating } from '@/domain/rating';

export const FIXTURE_CURRENT_VERSION = '脱敏当前版本';
export const FIXTURE_OLD_VERSION = '脱敏过往版本';
export const FIXTURE_CURRENT_VERSION_ID = 2;
export const FIXTURE_OLD_VERSION_ID = 1;
export const fixtureSource: DataSource = {
  kind: 'fixture', label: '脱敏测试数据', updatedAt: '2026-07-11T00:00:00.000Z', isStale: false,
};
export const fixturePlayer: Player = {
  id: 'fixture-player', displayName: '测试玩家', rating: 0, additionalRating: 0, source: fixtureSource,
};

function createRecord(index: number, isCurrent: boolean): ScoreRecord {
  const difficultyConstant = 11 + (index % 35) / 10;
  const achievements = 97 + (index % 8) * 0.5;
  return {
    songId: String((isCurrent ? 10000 : 0) + index + 1),
    title: `脱敏曲目 ${String(index + 1).padStart(2, '0')}`,
    type: index % 2 === 0 ? 'DX' : 'SD', levelIndex: index % 5,
    level: `${Math.floor(difficultyConstant)}${difficultyConstant % 1 >= 0.5 ? '+' : ''}`,
    difficulty: ['basic', 'advanced', 'expert', 'master', 'remaster'][index % 5] as ScoreRecord['difficulty'],
    difficultyConstant, achievements, dxScore: index % 7 === 0 ? null : 100000 + index,
    rating: calculateChartRating(difficultyConstant, achievements),
    fc: index % 6 === 0 ? null : 'fc', fs: index % 5 === 0 ? null : 'fs',
    rate: achievements >= 100.5 ? 'sssp' : achievements >= 100 ? 'sss' :
      achievements >= 99.5 ? 'ssp' : achievements >= 99 ? 'ss' : achievements >= 98 ? 'sp' : 's',
    version: isCurrent ? FIXTURE_CURRENT_VERSION : FIXTURE_OLD_VERSION,
  };
}

// Sanitized structural samples derived from local 678/697-record PoCs; no identity fields remain.
// 37 old + 17 current explicitly exercise B35/B15 truncation boundaries.
export const fixtureRecords: ScoreRecord[] = [
  ...Array.from({ length: 37 }, (_, index) => createRecord(index, false)),
  ...Array.from({ length: 17 }, (_, index) => createRecord(index + 37, true)),
];
fixturePlayer.rating = fixtureRecords.reduce((sum, record) => sum + record.rating, 0);

export const unknownEnumRawRecord = {
  achievements: 98.7654, ds: 13.4, dxScore: null, fc: 'future_fc', fs: 'future_fs', level: '13+',
  level_index: 3, level_label: 'FutureDifficulty', rate: 'future_rate', song_id: 999999,
  title: '未知枚举脱敏样例', type: 'FUTURE_TYPE', version: FIXTURE_OLD_VERSION,
};

// 8 条 Song fixture，覆盖正常/同名/日文长标题/缺 artist/unknown version/DX/SD/数字 id 对齐等边界。
// id 与 fixtureRecords 的 songId 对齐：旧版本 "1".."37"，当前版本 "10038".."10054"。
export const fixtureSongs: Song[] = [
  // a. 正常曲目（title + artist + version + 至少 1 个 chart）
  {
    id: '1',
    title: '正常曲目 A',
    artist: '艺术家 A',
    version: FIXTURE_CURRENT_VERSION,
    charts: [
      { songId: '1', type: 'DX', levelIndex: 3, level: '13+', difficulty: 'master', difficultyConstant: 13.6 },
    ],
  },
  // b. 曲名重复（同 title 不同 id，模拟同名不同版本）
  {
    id: '2',
    title: '正常曲目 A',
    artist: '艺术家 B',
    version: FIXTURE_OLD_VERSION,
    charts: [
      { songId: '2', type: 'SD', levelIndex: 2, level: '12', difficulty: 'expert', difficultyConstant: 12.0 },
    ],
  },
  // c. 日文长标题
  {
    id: '10038',
    title: 'マスカレイド・マスカレード',
    artist: '日本アーティスト',
    version: FIXTURE_CURRENT_VERSION,
    charts: [
      { songId: '10038', type: 'DX', levelIndex: 4, level: '14+', difficulty: 'remaster', difficultyConstant: 14.7 },
    ],
  },
  // d. 缺 artist（artist 为 undefined）
  {
    id: '3',
    title: '缺艺术家曲目',
    version: FIXTURE_CURRENT_VERSION,
    charts: [
      { songId: '3', type: 'SD', levelIndex: 1, level: '10+', difficulty: 'advanced', difficultyConstant: 10.6 },
    ],
  },
  // e. 未知 version（version 为 'unknown'）
  {
    id: '4',
    title: '未知版本曲目',
    artist: '艺术家 C',
    version: 'unknown',
    charts: [
      { songId: '4', type: 'DX', levelIndex: 0, level: '7', difficulty: 'basic', difficultyConstant: 7.0 },
    ],
  },
  // f. DX 类型曲目（多 chart）
  {
    id: '5',
    title: 'DX 专属曲目',
    artist: '艺术家 D',
    version: FIXTURE_CURRENT_VERSION,
    charts: [
      { songId: '5', type: 'DX', levelIndex: 2, level: '12+', difficulty: 'expert', difficultyConstant: 12.7 },
      { songId: '5', type: 'DX', levelIndex: 3, level: '13+', difficulty: 'master', difficultyConstant: 13.4 },
    ],
  },
  // g. SD 类型曲目（多 chart）
  {
    id: '6',
    title: 'SD 专属曲目',
    artist: '艺术家 E',
    version: FIXTURE_CURRENT_VERSION,
    charts: [
      { songId: '6', type: 'SD', levelIndex: 0, level: '5', difficulty: 'basic', difficultyConstant: 5.0 },
      { songId: '6', type: 'SD', levelIndex: 3, level: '13', difficulty: 'master', difficultyConstant: 13.0 },
    ],
  },
  // h. songId 为数字字符串（与 fixtureRecords 当前版本 songId 对齐）
  {
    id: '10039',
    title: '当前版本对齐曲目',
    artist: '艺术家 F',
    version: FIXTURE_CURRENT_VERSION,
    charts: [
      { songId: '10039', type: 'DX', levelIndex: 4, level: '14', difficulty: 'remaster', difficultyConstant: 14.2 },
    ],
  },
];

export const fixtureCatalog: CatalogSnapshot = {
  currentVersion: { id: FIXTURE_CURRENT_VERSION_ID, title: FIXTURE_CURRENT_VERSION },
  versions: [
    { id: FIXTURE_OLD_VERSION_ID, title: FIXTURE_OLD_VERSION },
    { id: FIXTURE_CURRENT_VERSION_ID, title: FIXTURE_CURRENT_VERSION },
  ],
  songs: fixtureSongs,
  chartVersionIndex: Object.fromEntries(fixtureRecords.map((record) => [
    chartVersionKey(record.songId, record.type, record.levelIndex),
    record.version === FIXTURE_CURRENT_VERSION ? FIXTURE_CURRENT_VERSION_ID : FIXTURE_OLD_VERSION_ID,
  ])),
  source: fixtureSource,
};
