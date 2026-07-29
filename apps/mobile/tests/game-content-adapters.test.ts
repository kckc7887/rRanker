import { describe, expect, it } from 'vitest';
import type { GameContentAdapter } from '@/domain/game-content';
import type { ScoreRecord, Song } from '@/domain/models';
import {
  maimaiContentAdapter,
  phigrosContentAdapter,
  presentChunithmScore,
  presentMaimaiScore,
  presentPhigrosScore,
} from '@/features/game-content/adapters';

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

const phigrosRecord: ScoreRecord = {
  ...maimaiRecord,
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
};

describe('game content adapters', () => {
  it('keeps maimai and phigros score semantics in extensions instead of renaming fields', () => {
    const maimai = maimaiContentAdapter.normalizeScore(maimaiRecord);
    const phigros = phigrosContentAdapter.normalizeScore(phigrosRecord);
    expect(maimai.gameId).toBe('maimai');
    expect(maimai.extension).toBe(maimaiRecord);
    expect(phigros.gameId).toBe('phigros');
    expect(phigros.extension).toBe(phigrosRecord);
  });

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

  it('supports a future game without changing the shared adapter interface', () => {
    type FutureSong = { id: string; title: string };
    type FutureChart = { songId: string; id: string };
    type FutureScore = { songId: string; chartId: string; score: number };
    const adapter: GameContentAdapter<'future-game', FutureSong, FutureChart, FutureScore> = {
      gameId: 'future-game',
      normalizeSong: (song) => ({
        gameId: 'future-game',
        songId: song.id,
        title: song.title,
        metadata: {},
        charts: [],
        extension: undefined,
      }),
      normalizeChart: (chart) => ({
        gameId: 'future-game',
        songId: chart.songId,
        chartId: chart.id,
        order: 0,
        label: 'NEW',
        level: '1',
        notes: [],
        extension: undefined,
      }),
      normalizeScore: (score) => ({
        gameId: 'future-game',
        songId: score.songId,
        chartId: score.chartId,
        order: 0,
        key: `${score.songId}:${score.chartId}`,
        title: 'Future Song',
        extension: undefined,
      }),
    };
    expect(adapter.normalizeSong({ id: 'future', title: 'Future Song' }).gameId).toBe('future-game');
  });

  it('normalizes a standard song without changing its provider object', () => {
    const song: Song = {
      id: '1',
      title: 'Song',
      version: 'Version',
      charts: [maimaiRecord],
    };
    const normalized = maimaiContentAdapter.normalizeSong(song);
    expect(normalized.extension).toBe(song);
    expect(normalized.charts[0]?.libraryRef).toEqual({ type: 'DX', levelIndex: 3 });
  });
});
