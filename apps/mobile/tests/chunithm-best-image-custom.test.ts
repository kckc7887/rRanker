import { describe, expect, it } from 'vitest';
import type { ChunithmScoreCardData } from '@/domain/chunithm-score-presentation';
import {
  buildCustomChunithmBestImageSections,
  DEFAULT_CUSTOM_CHUNITHM_BEST_IMAGE_FILTERS,
  parseBestImageQuantity,
  type CustomChunithmBestImageFilters,
} from '@/features/chunithm-best-image/chunithm-best-image-custom';

function card(id: number, overrides: Partial<ChunithmScoreCardData> = {}): ChunithmScoreCardData {
  return {
    key: `${id}-3`,
    songId: String(id),
    title: `Song ${id}`,
    levelIndex: 3,
    difficultyConstant: 14.5,
    versionId: 12,
    score: 1_000_000,
    rating: 16.0,
    rank: 'SS',
    clear: 'clear',
    ...overrides,
  };
}

function filters(overrides: Partial<CustomChunithmBestImageFilters> = {}): CustomChunithmBestImageFilters {
  return { ...DEFAULT_CUSTOM_CHUNITHM_BEST_IMAGE_FILTERS, ...overrides };
}

describe('buildCustomChunithmBestImageSections', () => {
  it('uses BestN title when no non-quantity condition is active', () => {
    const sections = buildCustomChunithmBestImageSections([
      card(1, { rating: 16.0 }),
      card(2, { rating: 17.5, score: 1_005_000 }),
      card(3, { rating: 16.5 }),
    ], filters({ quantity: 50 }));
    expect(sections).toHaveLength(1);
    expect(sections[0]?.id).toBe('custom');
    expect(sections[0]?.title).toBe('Best3');
    expect(sections[0]?.subtitle).toBeUndefined();
    expect(sections[0]?.records.map((item) => item.songId)).toEqual(['2', '3', '1']);
  });

  it('uses the single condition label as the title when exactly one condition is active', () => {
    const sections = buildCustomChunithmBestImageSections([
      card(1, { levelIndex: 4 }),
      card(2, { levelIndex: 4 }),
      card(3, { levelIndex: 3 }),
    ], filters({
      difficulty: 4,
      conditionLabels: ['ULTIMA'],
    }));
    expect(sections[0]?.title).toBe('ULTIMA2');
    expect(sections[0]?.subtitle).toBeUndefined();

    const byVersion = buildCustomChunithmBestImageSections([card(1)], filters({
      version: '12',
      versionConditionLabel: 'STAR',
    }));
    expect(byVersion[0]?.title).toBe('STAR1');
  });

  it('uses 自定义N with a subtitle when multiple conditions are active', () => {
    const sections = buildCustomChunithmBestImageSections([
      card(1, { rank: 'SSS+' }),
      card(2, { rank: 'SSS+' }),
      card(3, { rank: 'SSS+' }),
    ], filters({
      difficulty: 3,
      rankMin: 'SS',
      rankMax: null,
      conditionLabels: ['MASTER', '评价 SS~不限'],
    }));
    expect(sections[0]?.title).toBe('自定义3');
    expect(sections[0]?.subtitle).toBe('MASTER · 评价 SS~不限');
  });

  it('filters by difficulty, version, constant range and rank range', () => {
    const records = [
      card(1, { levelIndex: 3, versionId: 12, difficultyConstant: 14.5, rank: 'S+', rating: 15.8 }),
      card(2, { levelIndex: 4, versionId: 12, difficultyConstant: 14.5, rank: 'SSS+', rating: 16.4 }),
      card(3, { levelIndex: 3, versionId: 13, difficultyConstant: 14.5, rank: 'SSS+', rating: 16.3 }),
      card(4, { levelIndex: 3, versionId: 12, difficultyConstant: 13.0, rank: 'SSS+', rating: 16.2 }),
      card(5, { levelIndex: 3, versionId: 12, difficultyConstant: 14.5, rank: 'AAA', rating: 16.1 }),
      card(6, { levelIndex: 3, versionId: 12, difficultyConstant: 14.5, rank: 'SSS', rating: 16.5 }),
    ];
    const sections = buildCustomChunithmBestImageSections(records, filters({
      difficulty: 3,
      version: '12',
      constantMin: '14',
      constantMax: '15',
      rankMin: 'S',
      rankMax: 'SS+',
    }));
    // 仅 S+（1）落在 S ~ SS+ 区间；SSS（6）超出上限、AAA（5）低于下限。
    expect(sections[0]?.records.map((item) => item.songId)).toEqual(['1']);
  });

  it('treats WORLD\'S END without a constant as excluded once a constant bound is set', () => {
    const sections = buildCustomChunithmBestImageSections([
      card(1, { levelIndex: 5, difficultyConstant: undefined }),
      card(2, { levelIndex: 3, difficultyConstant: 15.0 }),
    ], filters({ constantMin: '14' }));
    expect(sections[0]?.records.map((item) => item.songId)).toEqual(['2']);
  });

  it('limits to quantity and treats 0 as unlimited', () => {
    const records = Array.from({ length: 8 }, (_, index) => card(index + 1, { rating: 16 + index * 0.1 }));
    expect(buildCustomChunithmBestImageSections(records, filters({ quantity: 3 }))[0]?.records)
      .toHaveLength(3);
    expect(buildCustomChunithmBestImageSections(records, filters({ quantity: 0 }))[0]?.records)
      .toHaveLength(8);
  });

  it('keeps the section with an empty record list when nothing matches', () => {
    const sections = buildCustomChunithmBestImageSections([], filters({
      difficulty: 4,
      conditionLabels: ['ULTIMA'],
    }));
    expect(sections).toHaveLength(1);
    expect(sections[0]?.records).toEqual([]);
    expect(sections[0]?.title).toBe('ULTIMA0');
  });
});

describe('parseBestImageQuantity', () => {
  it('parses non-negative integers and rejects invalid input', () => {
    expect(parseBestImageQuantity('50')).toBe(50);
    expect(parseBestImageQuantity('0')).toBe(0);
    expect(parseBestImageQuantity('１２')).toBe(12);
    expect(parseBestImageQuantity('-1')).toBeNull();
    expect(parseBestImageQuantity('abc')).toBeNull();
  });
});
