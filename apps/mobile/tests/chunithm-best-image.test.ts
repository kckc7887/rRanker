import { describe, expect, it, vi } from 'vitest';
import type { ChunithmScoreCardData } from '@/domain/chunithm-score-presentation';
import {
  appendChunithmSelectionScores,
  paginateChunithmBestImageSections,
} from '@/features/chunithm-best-image/chunithm-best-image';
import { buildChunithmBestImageHtml } from '@/features/chunithm-best-image/build-chunithm-best-image-html';
import {
  chunithmBestImageJacketUrl,
  resolveChunithmBestImageJacketId,
} from '@/features/chunithm-best-image/load-chunithm-best-image-jackets';
import { parseChunithmBestImageStylePreferences } from '@/features/chunithm-best-image/chunithm-best-image-preferences';
import type { ChunithmCatalogSnapshot } from '@/domain/chunithm';

vi.mock('expo-image', () => ({
  Image: {
    getCachePathAsync: vi.fn(),
    prefetch: vi.fn(),
  },
}));
vi.mock('expo-file-system', () => ({
  File: class MockFile {
    constructor(public readonly uri: string) {}
    base64() { return Promise.resolve(''); }
  },
}));

function card(id: number, overrides: Partial<ChunithmScoreCardData> = {}): ChunithmScoreCardData {
  return {
    key: `${id}-3`,
    songId: String(id),
    title: `Song ${id}`,
    levelIndex: 3,
    difficultyConstant: 14.5,
    score: 1_009_000,
    rating: 16.5,
    rank: 'SSS+',
    clear: 'clear',
    ...overrides,
  };
}

describe('appendChunithmSelectionScores', () => {
  const base = [
    { id: 'b30', title: 'Best 30', records: [card(1), card(2)] },
    { id: 'new20', title: 'New 20', records: [card(3)] },
  ];
  const selections = [card(101), card(102), card(103), card(104), card(105), card(106)];

  it('does not append when count is 0', () => {
    const result = appendChunithmSelectionScores(base, selections, 0);
    expect(result).toHaveLength(2);
    expect(result.map((section) => section.id)).toEqual(['b30', 'new20']);
  });

  it('appends Selection with up to 5 scores at the bottom', () => {
    const result = appendChunithmSelectionScores(base, selections, 5);
    expect(result).toHaveLength(3);
    expect(result[2]).toMatchObject({ id: 'selection', title: 'Selection' });
    expect(result[2]!.records).toHaveLength(5);
    expect(result[2]!.records.map((record) => record.songId)).toEqual([
      '101', '102', '103', '104', '105',
    ]);
  });

  it('appends Selection with up to 10 scores', () => {
    const result = appendChunithmSelectionScores(base, selections, 10);
    expect(result[2]!.records).toHaveLength(6);
  });

  it('skips Selection section when selections are empty', () => {
    expect(appendChunithmSelectionScores(base, [], 10)).toHaveLength(2);
  });
});

describe('paginateChunithmBestImageSections', () => {
  it('keeps section order across pages', () => {
    const sections = appendChunithmSelectionScores(
      [
        { id: 'b30', title: 'Best 30', records: Array.from({ length: 30 }, (_, i) => card(i + 1)) },
        { id: 'new20', title: 'New 20', records: Array.from({ length: 20 }, (_, i) => card(i + 31)) },
      ],
      Array.from({ length: 10 }, (_, i) => card(i + 100)),
      10,
    );
    const pages = paginateChunithmBestImageSections(sections, 60);
    expect(pages).toHaveLength(1);
    expect(pages[0]!.sections.map((section) => section.id)).toEqual(['b30', 'new20', 'selection']);
  });
});

describe('chunithm best image jackets', () => {
  it('builds jacket urls from jacket id', () => {
    expect(chunithmBestImageJacketUrl('42')).toBe('https://assets2.lxns.net/chunithm/jacket/42.png');
  });

  it('prefers WORLD\'S END originId', () => {
    const catalog = {
      songs: [{
        id: 9001,
        title: 'WE Song',
        genre: 'n/a',
        bpm: 120,
        versionId: 1,
        versionTitle: 'v',
        locked: false,
        disabled: false,
        difficulties: [{
          difficulty: 5 as const,
          level: '☆☆☆',
          levelValue: 0,
          versionId: 1,
          versionTitle: 'v',
          originId: 123,
        }],
      }],
      versions: [],
      genres: [],
      currentVersion: { id: 1, title: 'v' },
      source: { kind: 'fixture' as const, label: 't', updatedAt: '', isStale: false },
    } satisfies ChunithmCatalogSnapshot;
    expect(resolveChunithmBestImageJacketId('9001', 5, catalog)).toBe('123');
    expect(resolveChunithmBestImageJacketId('9001', 3, catalog)).toBe('9001');
  });
});

describe('buildChunithmBestImageHtml', () => {
  it('renders Best 30 / New 20 / Selection and score fields', () => {
    const html = buildChunithmBestImageHtml({
      type: 'best50',
      width: 1080,
      player: {
        name: '测试玩家',
        level: 99,
        rating: 16.5,
        rating_possession: 'rainbow',
        friend_code: 1,
        class_emblem: { base: 0, medal: 0 },
        reborn_count: 1,
        over_power: 0,
        over_power_progress: 0,
        currency: 0,
        total_currency: 0,
        total_play_count: 0,
      },
      ratingDisplay: '16.50',
      page: {
        id: 'chunithm-page-0',
        pageIndex: 0,
        pageCount: 1,
        sections: [
          { id: 'b30', title: 'Best 30', records: [card(1)] },
          { id: 'new20', title: 'New 20', records: [card(2)] },
          { id: 'selection', title: 'Selection', records: [card(3)] },
        ],
      },
      coverUrls: { '1': null, '2': null, '3': null },
      jacketIds: { '1-3': '1', '2-3': '2', '3-3': '3' },
    });
    expect(html).toContain('Best 30');
    expect(html).toContain('New 20');
    expect(html).toContain('Selection');
    expect(html).toContain('测试玩家');
    expect(html).toContain('16.50');
    expect(html).toContain('1,009,000');
    expect(html).toContain('SSS+');
    expect(html).toContain('Song 1');
  });
});

describe('parseChunithmBestImageStylePreferences', () => {
  it('accepts selectionCount 0/5/10', () => {
    expect(parseChunithmBestImageStylePreferences({ version: 1, selectionCount: 5 }).selectionCount).toBe(5);
    expect(parseChunithmBestImageStylePreferences({ version: 1, selectionCount: 10 }).selectionCount).toBe(10);
    expect(parseChunithmBestImageStylePreferences({ version: 1, selectionCount: 3 }).selectionCount).toBe(0);
  });
});
