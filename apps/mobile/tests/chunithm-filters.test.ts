import {
  CHUNITHM_RANKS_ASC,
  matchesChunithmChartFilter,
  matchesChunithmConstantRange,
  matchesChunithmRankRange,
  parseChunithmConstantBound,
} from '@/domain/chunithm-filters';
import type { ChunithmRank } from '@/domain/chunithm-score-presentation';

describe('chunithm constant filters', () => {
  it('parses non-negative finite bounds and ignores empty or invalid input', () => {
    expect(parseChunithmConstantBound(' 13.7 ')).toBe(13.7);
    expect(parseChunithmConstantBound('１３，７')).toBe(13.7);
    expect(parseChunithmConstantBound('')).toBeUndefined();
    expect(parseChunithmConstantBound('invalid')).toBeUndefined();
    expect(parseChunithmConstantBound('-1')).toBeUndefined();
  });

  it('uses inclusive open-ended bounds and returns no match for reversed bounds', () => {
    expect(matchesChunithmConstantRange(13.7, '13.7', '14.8')).toBe(true);
    expect(matchesChunithmConstantRange(14.8, '13.7', '14.8')).toBe(true);
    expect(matchesChunithmConstantRange(13.6, '13.7', '')).toBe(false);
    expect(matchesChunithmConstantRange(14.9, '', '14.8')).toBe(false);
    expect(matchesChunithmConstantRange(13.7, '14', '13')).toBe(false);
  });

  it("keeps WORLD'S END without a valid constant filter and excludes it with either bound", () => {
    expect(matchesChunithmConstantRange(undefined, '', '')).toBe(true);
    expect(matchesChunithmConstantRange(undefined, 'invalid', '')).toBe(true);
    expect(matchesChunithmConstantRange(undefined, '13', '')).toBe(false);
    expect(matchesChunithmConstantRange(undefined, '', '15')).toBe(false);
  });
});

describe('chunithm chart filters', () => {
  const ultima = {
    difficulty: 4 as const,
    levelValue: 14.7,
    versionId: 23000,
  };

  it('requires difficulty, chart version and constant to match the same chart', () => {
    expect(matchesChunithmChartFilter(ultima, {
      difficulty: 4,
      version: '23000',
      constantMin: '14.7',
      constantMax: '14.7',
    })).toBe(true);
    expect(matchesChunithmChartFilter(ultima, {
      difficulty: 3,
      version: '23000',
      constantMin: '',
      constantMax: '',
    })).toBe(false);
    expect(matchesChunithmChartFilter(ultima, {
      difficulty: 4,
      version: '22000',
      constantMin: '',
      constantMax: '',
    })).toBe(false);
  });
});

describe('chunithm rank ranges', () => {
  it('keeps the complete ordered rank contract', () => {
    expect(CHUNITHM_RANKS_ASC).toEqual([
      'D', 'C', 'B', 'BB', 'BBB', 'A', 'AA', 'AAA',
      'S', 'S+', 'SS', 'SS+', 'SSS', 'SSS+',
    ]);
  });

  it.each(CHUNITHM_RANKS_ASC)('matches %s when both ends are unlimited', (rank) => {
    expect(matchesChunithmRankRange(rank, null, null)).toBe(true);
  });

  it('uses inclusive bounds, supports either open end and rejects reversed bounds', () => {
    expect(matchesChunithmRankRange('S', 'S', 'SSS')).toBe(true);
    expect(matchesChunithmRankRange('SSS', 'S', 'SSS')).toBe(true);
    expect(matchesChunithmRankRange('S+', 'S', 'SSS')).toBe(true);
    expect(matchesChunithmRankRange('AAA', 'S', null)).toBe(false);
    expect(matchesChunithmRankRange('SSS+', null, 'SSS')).toBe(false);
    expect(matchesChunithmRankRange('SS' as ChunithmRank, 'SSS', 'S')).toBe(false);
  });
});
