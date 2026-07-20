import { describe, expect, it } from 'vitest';
import type { ScoreRecord } from '@/domain/models';
import {
  buildCustomBestImageSections,
  maximumBestImageRowsForWidth,
  DEFAULT_CUSTOM_BEST_IMAGE_FILTERS,
  paginateBestImageSections,
  parseBestImageMinimumAchievement,
  parseBestImageQuantity,
  type CustomBestImageFilters,
} from '@/features/best-image/best-image-custom';

function score(overrides: Partial<ScoreRecord> = {}): ScoreRecord {
  return {
    songId: '1', title: '测试曲', type: 'DX', levelIndex: 3, level: '13', difficulty: 'master',
    difficultyConstant: 13, achievements: 100, dxScore: 1800, rating: 280,
    fc: 'fc', fs: 'sync', rate: 'sss', version: '当前版本',
    ...overrides,
  };
}

function filters(overrides: Partial<CustomBestImageFilters> = {}): CustomBestImageFilters {
  return { ...DEFAULT_CUSTOM_BEST_IMAGE_FILTERS, ...overrides };
}

describe('custom best image', () => {
  it('combines both versions by default and uses the actual result count', () => {
    const sections = buildCustomBestImageSections([
      score({ songId: '1', rating: 100 }),
      score({ songId: '2', version: '旧版本', rating: 300 }),
      score({ songId: '3', version: 'unknown', rating: 999 }),
    ], '当前版本', filters({ quantity: 50 }));
    expect(sections).toHaveLength(1);
    expect(sections[0]?.title).toBe('Best2');
    expect(sections[0]?.records.map((item) => item.songId)).toEqual(['2', '1']);
  });

  it('splits versions and applies the quantity independently', () => {
    const records = [
      score({ songId: '1', rating: 300 }), score({ songId: '2', rating: 200 }),
      score({ songId: '3', version: '旧版本', rating: 250 }), score({ songId: '4', version: '旧版本', rating: 150 }),
    ];
    const sections = buildCustomBestImageSections(records, '当前版本', filters({ quantity: 1, splitVersions: true }));
    expect(sections.map((section) => section.title)).toEqual(['当前版本Best1', '过往版本Best1']);
    expect(sections.map((section) => section.records[0]?.songId)).toEqual(['1', '3']);
  });

  it('uses achievement labels and supports minimum or strict matching', () => {
    const records = [
      score({ songId: 'fc', fc: 'fc' }), score({ songId: 'fcp', fc: 'fcp' }),
      score({ songId: 'ap', fc: 'ap' }), score({ songId: 'app', fc: 'app' }),
    ];
    const atLeast = buildCustomBestImageSections(records, '当前版本', filters({
      versions: ['current'], achievement: { family: 'fc', value: 'fcp' }, quantity: 100,
    }));
    expect(atLeast[0]?.title).toBe('当前版本FC+3');
    const strict = buildCustomBestImageSections(records, '当前版本', filters({
      versions: ['current'], achievement: { family: 'fc', value: 'fcp' }, strictAchievement: true, quantity: 100,
    }));
    expect(strict[0]?.title).toBe('当前版本FC+1');
    expect(strict[0]?.records[0]?.songId).toBe('fcp');
  });

  it('filters SYNC and higher fs achievements without treating sync rank as falsy', () => {
    const records = [
      score({ songId: 'sync', fs: 'sync' }),
      score({ songId: 'fs', fs: 'fs' }),
      score({ songId: 'fsp', fs: 'fsp' }),
      score({ songId: 'none', fs: null }),
    ];
    const atLeast = buildCustomBestImageSections(records, '当前版本', filters({
      versions: ['current'], achievement: { family: 'fs', value: 'sync' }, quantity: 100,
    }));
    expect(atLeast[0]?.title).toBe('当前版本SYNC3');
    expect(new Set(atLeast[0]?.records.map((item) => item.songId))).toEqual(new Set(['sync', 'fs', 'fsp']));

    const strict = buildCustomBestImageSections(records, '当前版本', filters({
      versions: ['current'], achievement: { family: 'fs', value: 'sync' }, strictAchievement: true, quantity: 100,
    }));
    expect(strict[0]?.title).toBe('当前版本SYNC1');
    expect(strict[0]?.records.map((item) => item.songId)).toEqual(['sync']);
  });

  it('normalizes FDX aliases and filters achievement inclusively', () => {
    const records = [
      score({ songId: 'sync', fs: 'sync', achievements: 100.49 }),
      score({ songId: 'fdx', fs: 'fdx', achievements: 100.5 }),
      score({ songId: 'fdxp', fs: 'fdxp', achievements: 101 }),
    ];
    const sections = buildCustomBestImageSections(records, '当前版本', filters({
      versions: ['current'], achievement: { family: 'fs', value: 'fsd' }, minimumAchievement: 100.5,
    }));
    expect(sections[0]?.title).toBe('当前版本FDX2');
    expect(sections[0]?.records.map((item) => item.songId)).toEqual(['fdxp', 'fdx']);
  });

  it('filters both near-miss ranges with inclusive four-decimal boundaries', () => {
    const sections = buildCustomBestImageSections([
      score({ songId: 'before-100', achievements: 99.8999 }),
      score({ songId: 'start-100', achievements: 99.9 }),
      score({ songId: 'end-100', achievements: 99.9999 }),
      score({ songId: 'start-1005', achievements: 100.49 }),
      score({ songId: 'end-1005', achievements: 100.4999 }),
      score({ songId: 'after-1005', achievements: 100.5 }),
    ], '当前版本', filters({ versions: ['current'], nearMiss: true, quantity: 100 }));
    expect(sections[0]?.title).toBe('当前版本寸Best4');
    expect(sections[0]?.records.map((item) => item.songId)).toEqual([
      'end-1005', 'start-1005', 'end-100', 'start-100',
    ]);
  });

  it('combines near miss with AP+, FDX+, strict matching and minimum achievement', () => {
    const records = [
      score({ songId: 'match', achievements: 100.4999, fc: 'app', fs: 'fdxp' }),
      score({ songId: 'not-near', achievements: 100.5, fc: 'app', fs: 'fdxp' }),
      score({ songId: 'wrong-fc', achievements: 100.4999, fc: 'ap', fs: 'fdxp' }),
      score({ songId: 'wrong-fs', achievements: 100.4999, fc: 'app', fs: 'fdx' }),
      score({ songId: 'too-low', achievements: 99.9999, fc: 'app', fs: 'fdxp' }),
    ];
    const apPlus = buildCustomBestImageSections(records, '当前版本', filters({
      versions: ['current'], nearMiss: true, achievement: { family: 'fc', value: 'app' },
      strictAchievement: true, minimumAchievement: 100.49, quantity: 100,
    }));
    expect(apPlus[0]?.title).toBe('当前版本寸AP+2');
    expect(apPlus[0]?.records.map((item) => item.songId)).toEqual(['match', 'wrong-fs']);

    const fdxPlus = buildCustomBestImageSections(records, '当前版本', filters({
      versions: ['current'], nearMiss: true, achievement: { family: 'fs', value: 'fsdp' },
      strictAchievement: true, minimumAchievement: 100.49, quantity: 100,
    }));
    expect(fdxPlus[0]?.title).toBe('当前版本寸FDX+2');
    expect(fdxPlus[0]?.records.map((item) => item.songId)).toEqual(['match', 'wrong-fc']);
  });

  it('parses quantity and achievement boundaries', () => {
    expect(parseBestImageQuantity('０')).toBe(0);
    expect(parseBestImageQuantity('-1')).toBeNull();
    expect(parseBestImageQuantity('1.5')).toBeNull();
    expect(parseBestImageMinimumAchievement('101')).toBe(101);
    expect(parseBestImageMinimumAchievement('１００，５')).toBe(100.5);
    expect(parseBestImageMinimumAchievement('101.1')).toBeNull();
  });

  it('paginates at 50 five-card rows with continuous rank offsets', () => {
    const records = Array.from({ length: 251 }, (_, index) => score({ songId: String(index + 1), rating: 1000 - index }));
    const pages = paginateBestImageSections([{ id: 'custom', title: 'Best251', records }]);
    expect(pages).toHaveLength(2);
    expect(pages[0]?.sections[0]?.records).toHaveLength(250);
    expect(pages[1]?.sections[0]?.records).toHaveLength(1);
    expect(pages[1]?.sections[0]?.rankOffset).toBe(250);
    expect(pages.map((page) => [page.pageIndex, page.pageCount])).toEqual([[0, 2], [1, 2]]);
  });

  it('reduces rows per page as output resolution increases', () => {
    expect(maximumBestImageRowsForWidth(1080)).toBe(50);
    expect(maximumBestImageRowsForWidth(1440)).toBe(28);
    expect(maximumBestImageRowsForWidth(2160)).toBe(12);
  });
});
