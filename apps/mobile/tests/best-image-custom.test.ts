import { describe, expect, it } from 'vitest';
import type { ScoreRecord } from '@/domain/models';
import {
  buildCustomBestImageSections,
  maximumBestImageRowsForWidth,
  DEFAULT_CUSTOM_BEST_IMAGE_FILTERS,
  paginateBestImageSections,
  parseBestImageQuantity,
  type CustomBestImageFilters,
} from '@/features/best-image/best-image-custom';

function score(overrides: Partial<ScoreRecord> = {}): ScoreRecord {
  return {
    songId: '1', title: '测试曲', type: 'DX', levelIndex: 3, level: '13', difficulty: 'master',
    difficultyConstant: 13, achievements: 100, dxScore: 1800, rating: 280,
    fc: 'fc', fs: 'fs', rate: 'sss', version: '当前版本',
    ...overrides,
  };
}

function filters(overrides: Partial<CustomBestImageFilters> = {}): CustomBestImageFilters {
  return { ...DEFAULT_CUSTOM_BEST_IMAGE_FILTERS, versions: ['当前版本'], ...overrides };
}

describe('custom best image', () => {
  it('uses BestN title when no non-quantity condition is active', () => {
    const sections = buildCustomBestImageSections([
      score({ songId: '1', rating: 100 }),
      score({ songId: '2', version: '旧版本', rating: 300 }),
      score({ songId: '3', version: 'unknown', rating: 999 }),
    ], filters({ versions: ['当前版本', '旧版本'], quantity: 50 }));
    expect(sections).toHaveLength(1);
    expect(sections[0]?.title).toBe('Best2');
    expect(sections[0]?.subtitle).toBeUndefined();
    expect(sections[0]?.records.map((item) => item.songId)).toEqual(['2', '1']);
  });

  it('uses the single condition label as the title when exactly one condition is active', () => {
    const records = [
      score({ songId: 'master-a', difficulty: 'master' }),
      score({ songId: 'master-b', difficulty: 'master' }),
      score({ songId: 'expert', difficulty: 'expert' }),
    ];
    const sections = buildCustomBestImageSections(records, filters({
      difficulty: 'master',
      conditionLabels: ['MASTER'],
    }));
    expect(sections[0]?.title).toBe('MASTER2');
    expect(sections[0]?.subtitle).toBeUndefined();

    const singleVersion = buildCustomBestImageSections([score()], filters({
      versions: ['当前版本'],
      versionConditionLabel: '当前版本',
    }));
    expect(singleVersion[0]?.title).toBe('当前版本1');
  });

  it('uses 自定义N with a subtitle when multiple conditions are active', () => {
    const sections = buildCustomBestImageSections([
      score({ songId: '1', achievements: 100.49 }),
      score({ songId: '2', achievements: 100.49 }),
      score({ songId: '3', achievements: 100.49 }),
    ], filters({
      difficulty: 'master',
      nearMiss: true,
      conditionLabels: ['MASTER', '寸'],
    }));
    expect(sections[0]?.title).toBe('自定义3');
    expect(sections[0]?.subtitle).toBe('MASTER · 寸');
  });

  it('returns no sections when no versions are selected', () => {
    const sections = buildCustomBestImageSections([score()], filters({ versions: [] }));
    expect(sections).toHaveLength(0);
  });

  it('excludes U·TA·GE records from custom best images', () => {
    const sections = buildCustomBestImageSections([
      score({ songId: 'regular', rating: 100 }),
      score({
        songId: '100123',
        type: 'UTAGE',
        levelIndex: 0,
        difficulty: 'utage',
        difficultyConstant: 0,
        rating: 0,
      }),
    ], filters({ quantity: 50 }));

    expect(sections[0]?.records.map((item) => item.songId)).toEqual(['regular']);
  });

  it('splits every selected version into its own section with quantity applied independently', () => {
    const records = [
      score({ songId: '1', rating: 300 }), score({ songId: '2', rating: 200 }),
      score({ songId: '3', version: '旧版本', rating: 250 }), score({ songId: '4', version: '旧版本', rating: 150 }),
    ];
    const sections = buildCustomBestImageSections(records, filters({
      versions: ['当前版本', '旧版本'], quantity: 1, splitVersions: true,
    }));
    expect(sections.map((section) => section.title)).toEqual(['当前版本1', '旧版本1']);
    expect(sections.map((section) => section.records[0]?.songId)).toEqual(['1', '3']);
  });

  it('uses localized version labels in split and single-version titles', () => {
    const records = [
      score({ songId: '1', rating: 300 }),
      score({ songId: '2', version: '旧版本', rating: 250 }),
    ];
    const split = buildCustomBestImageSections(records, filters({
      versions: ['当前版本', '旧版本'],
      splitVersions: true,
      versionLabels: { '当前版本': '舞萌DX 2026', '旧版本': '过往版本' },
    }));
    expect(split.map((section) => section.title)).toEqual(['舞萌DX 20261', '过往版本1']);

    const single = buildCustomBestImageSections(records, filters({
      versions: ['当前版本'],
      versionConditionLabel: '舞萌DX 2026',
      versionLabels: { '当前版本': '舞萌DX 2026' },
    }));
    expect(single[0]?.title).toBe('舞萌DX 20261');
  });

  it('filters by difficulty and chart type', () => {
    const records = [
      score({ songId: 'master-dx', difficulty: 'master', type: 'DX' }),
      score({ songId: 'master-sd', difficulty: 'master', type: 'SD' }),
      score({ songId: 'expert-dx', difficulty: 'expert', type: 'DX' }),
    ];
    const difficultyOnly = buildCustomBestImageSections(records, filters({ difficulty: 'master' }));
    expect(difficultyOnly[0]?.records.map((item) => item.songId)).toEqual(['master-dx', 'master-sd']);
    const typeOnly = buildCustomBestImageSections(records, filters({ type: 'DX' }));
    expect(typeOnly[0]?.records.map((item) => item.songId)).toEqual(['expert-dx', 'master-dx']);
    const both = buildCustomBestImageSections(records, filters({ difficulty: 'master', type: 'SD' }));
    expect(both[0]?.records.map((item) => item.songId)).toEqual(['master-sd']);
  });

  it('filters by constant and achievement ranges', () => {
    const records = [
      score({ songId: 'low', difficultyConstant: 12, achievements: 98 }),
      score({ songId: 'match', difficultyConstant: 13.4, achievements: 100 }),
      score({ songId: 'high', difficultyConstant: 14.5, achievements: 101 }),
    ];
    const constantOnly = buildCustomBestImageSections(records, filters({ constantMin: '13', constantMax: '14' }));
    expect(constantOnly[0]?.records.map((item) => item.songId)).toEqual(['match']);
    const achievementOnly = buildCustomBestImageSections(records, filters({ achievementMin: '99.5', achievementMax: '100.5' }));
    expect(achievementOnly[0]?.records.map((item) => item.songId)).toEqual(['match']);
    const achievementMinOnly = buildCustomBestImageSections(records, filters({ achievementMin: '100.6' }));
    expect(achievementMinOnly[0]?.records.map((item) => item.songId)).toEqual(['high']);
  });

  it('uses achievement labels and supports minimum or strict matching', () => {
    const records = [
      score({ songId: 'fc', fc: 'fc' }), score({ songId: 'fcp', fc: 'fcp' }),
      score({ songId: 'ap', fc: 'ap' }), score({ songId: 'app', fc: 'app' }),
    ];
    const atLeast = buildCustomBestImageSections(records, filters({
      soloAchievement: 'fcp', conditionLabels: ['单人 FC+'], quantity: 100,
    }));
    expect(atLeast[0]?.title).toBe('单人 FC+3');
    const strict = buildCustomBestImageSections(records, filters({
      soloAchievement: 'fcp', strictAchievement: true,
      conditionLabels: ['单人 FC+', '严格'], quantity: 100,
    }));
    expect(strict[0]?.title).toBe('自定义1');
    expect(strict[0]?.subtitle).toBe('单人 FC+ · 严格');
    expect(strict[0]?.records[0]?.songId).toBe('fcp');
  });

  it('filters FS and higher fs achievements without treating fs rank as falsy', () => {
    const records = [
      score({ songId: 'sync-only', fs: 'sync' }),
      score({ songId: 'fs', fs: 'fs' }),
      score({ songId: 'fsp', fs: 'fsp' }),
      score({ songId: 'none', fs: null }),
    ];
    const atLeast = buildCustomBestImageSections(records, filters({
      multiAchievement: 'fs', conditionLabels: ['多人 FS'], quantity: 100,
    }));
    expect(atLeast[0]?.title).toBe('多人 FS2');
    expect(new Set(atLeast[0]?.records.map((item) => item.songId))).toEqual(new Set(['fs', 'fsp']));

    const strict = buildCustomBestImageSections(records, filters({
      multiAchievement: 'fs', strictAchievement: true,
      conditionLabels: ['多人 FS', '严格'], quantity: 100,
    }));
    expect(strict[0]?.title).toBe('自定义1');
    expect(strict[0]?.records.map((item) => item.songId)).toEqual(['fs']);
  });

  it('normalizes FDX aliases and filters achievement inclusively', () => {
    const records = [
      score({ songId: 'sync-only', fs: 'sync', achievements: 100.49 }),
      score({ songId: 'fdx', fs: 'fdx', achievements: 100.5 }),
      score({ songId: 'fdxp', fs: 'fdxp', achievements: 101 }),
    ];
    const sections = buildCustomBestImageSections(records, filters({
      multiAchievement: 'fsd', achievementMin: '100.5',
      conditionLabels: ['多人 FDX', '达成率 100.5~不限%'],
    }));
    expect(sections[0]?.title).toBe('自定义2');
    expect(sections[0]?.subtitle).toBe('多人 FDX · 达成率 100.5~不限%');
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
    ], filters({ nearMiss: true, conditionLabels: ['寸'], quantity: 100 }));
    expect(sections[0]?.title).toBe('寸4');
    expect(sections[0]?.records.map((item) => item.songId)).toEqual([
      'end-1005', 'start-1005', 'end-100', 'start-100',
    ]);
  });

  it('combines near miss with AP+, FDX+, strict matching and achievement minimum', () => {
    const records = [
      score({ songId: 'match', achievements: 100.4999, fc: 'app', fs: 'fdxp' }),
      score({ songId: 'not-near', achievements: 100.5, fc: 'app', fs: 'fdxp' }),
      score({ songId: 'wrong-fc', achievements: 100.4999, fc: 'ap', fs: 'fdxp' }),
      score({ songId: 'wrong-fs', achievements: 100.4999, fc: 'app', fs: 'fdx' }),
      score({ songId: 'too-low', achievements: 99.9999, fc: 'app', fs: 'fdxp' }),
    ];
    const apPlus = buildCustomBestImageSections(records, filters({
      nearMiss: true, soloAchievement: 'app',
      strictAchievement: true, achievementMin: '100.49',
      conditionLabels: ['寸', '单人 AP+', '严格', '达成率 100.49~不限%'], quantity: 100,
    }));
    expect(apPlus[0]?.title).toBe('自定义2');
    expect(apPlus[0]?.subtitle).toBe('寸 · 单人 AP+ · 严格 · 达成率 100.49~不限%');
    expect(apPlus[0]?.records.map((item) => item.songId)).toEqual(['match', 'wrong-fs']);

    const fdxPlus = buildCustomBestImageSections(records, filters({
      nearMiss: true, multiAchievement: 'fsdp',
      strictAchievement: true, achievementMin: '100.49',
      conditionLabels: ['寸', '多人 FDX+', '严格', '达成率 100.49~不限%'], quantity: 100,
    }));
    expect(fdxPlus[0]?.title).toBe('自定义2');
    expect(fdxPlus[0]?.records.map((item) => item.songId)).toEqual(['match', 'wrong-fc']);

    const both = buildCustomBestImageSections(records, filters({
      nearMiss: true, soloAchievement: 'app', multiAchievement: 'fsdp',
      strictAchievement: true, achievementMin: '100.49',
      conditionLabels: ['寸', '单人 AP+', '多人 FDX+', '严格', '达成率 100.49~不限%'], quantity: 100,
    }));
    expect(both[0]?.title).toBe('自定义1');
    expect(both[0]?.subtitle).toBe('寸 · 单人 AP+ · 多人 FDX+ · 严格 · 达成率 100.49~不限%');
    expect(both[0]?.records.map((item) => item.songId)).toEqual(['match']);
  });

  it('filters records by selected DX rating tags', () => {
    const dxRatingTagIndex = new Map([['1:DX:3', new Set([7])]]);
    const records = [
      score({ songId: '1' }),
      score({ songId: '2' }),
    ];
    const withTag = buildCustomBestImageSections(records, filters({
      selectedDxRatingTagIds: [7], dxRatingTagIndex,
    }));
    expect(withTag[0]?.records.map((item) => item.songId)).toEqual(['1']);

    const withoutTags = buildCustomBestImageSections(records, filters({ dxRatingTagIndex }));
    expect(withoutTags[0]?.records.map((item) => item.songId)).toEqual(['1', '2']);
  });

  it('parses quantity boundaries', () => {
    expect(parseBestImageQuantity('０')).toBe(0);
    expect(parseBestImageQuantity('-1')).toBeNull();
    expect(parseBestImageQuantity('1.5')).toBeNull();
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
