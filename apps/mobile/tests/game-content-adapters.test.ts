import { describe, expect, it } from 'vitest';
import type { ScoreRecord } from '@rranker/game-maimai/domain/models';
import type { ScoreRecord as PhigrosScoreRecord } from '@rranker/game-phigros/domain/models';
import { presentChunithmScore } from '@rranker/game-chunithm/presentation';
import { presentMaimaiScore } from '@rranker/game-maimai/presentation';
import { presentPhigrosScore } from '@rranker/game-phigros/presentation';

const maimaiRecord: ScoreRecord = {
  songId: '1',
  title: 'Maimai Song',
  type: 'DX',
  levelIndex: 3,
  level: '14+',
  difficulty: 'master',
  difficultyConstant: 14.7,
  achievements: 100.5,
  dxScore: 1234,
  rating: 321,
  fc: 'app',
  fs: 'fsdp',
  rate: 'sssp',
  version: 'current',
};

const phigrosRecord: PhigrosScoreRecord = {
  songId: 'phi.0',
  title: 'Phigros Song',
  type: 'SD',
  levelIndex: 2,
  level: 'IN',
  difficulty: 'expert',
  difficultyConstant: 15.5,
  achievements: 99.5,
  dxScore: 1_000_000,
  rating: 15.42,
  fc: 'ap',
  fs: null,
  rate: 'phi',
  version: 'current',
};

describe('game content adapters', () => {
  it('maps all current games to the shared score presentation contract', () => {
    expect(presentMaimaiScore(maimaiRecord).primaryMetric.text).toBe('100.5000%');
    expect(presentPhigrosScore(phigrosRecord).primaryMetric.tone).toBe('phi');
    expect(presentChunithmScore({
      key: '3-3',
      songId: '3',
      title: 'Chunithm Song',
      levelIndex: 3,
      score: 1_009_000,
      rating: 15.4,
      rank: 'SSS+',
      clear: 'clear',
    }).primaryMetric.effect).toBe('flowing-gradient');
  });
});
