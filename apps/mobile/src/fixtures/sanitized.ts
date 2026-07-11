import type { DataSource, Player, ScoreRecord } from '@/domain/models';
import { calculateChartRating } from '@/domain/rating';

export const FIXTURE_CURRENT_VERSION = 'M0 Current Version';
export const FIXTURE_OLD_VERSION = 'M0 Previous Version';
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
    rate: achievements >= 100 ? 'sss' : achievements >= 99 ? 'ss' : 's',
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
