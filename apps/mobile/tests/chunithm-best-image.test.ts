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
import { buildChunithmTrophyUrl } from '@/domain/chunithm-personal';

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
  it('uses the trophy id image URL when a prepared data URI is unavailable', () => {
    const trophyImageUrl = buildChunithmTrophyUrl(42);
    const html = buildChunithmBestImageHtml({
      type: 'best50',
      width: 1080,
      player: null,
      ratingDisplay: '0.00',
      trophyImageUrl,
      trophyName: '称号回退',
      page: {
        id: 'chunithm-page-0',
        pageIndex: 0,
        pageCount: 1,
        sections: [],
      },
    });

    expect(trophyImageUrl).toBe('https://assets2.lxns.net/chunithm/trophy/42.png');
    expect(html).toContain('class="trophy-image"');
    expect(html).toContain('src="https://assets2.lxns.net/chunithm/trophy/42.png"');
    expect(html).toContain('<span class="trophy-fallback" style="display:none">称号回退</span>');
  });

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
    expect(html).not.toContain('class="chart-type"');
    expect(html).toContain('score-card-foot"><span class="score-badges"');
    expect(html).toContain('.score-badges{display:flex;min-width:0;align-items:center;justify-content:flex-start');
    expect(html).toContain('class="profile-banner"');
    expect(html).toContain('height:187.5px;display:grid;grid-template-columns:1fr 266.25px 93.75px;grid-template-rows:46.875px 46.875px 93.75px');
    expect(html).toContain('<div class="profile-spacer" aria-hidden="true"></div>');
    expect(html).toContain('class="player-name-row"');
    expect(html).toContain('class="player-level">Lv.99</span>');
    expect(html).toMatch(/class="player-level">Lv\.99<\/span>\s*<span class="player-name"[^>]*>测试玩家<\/span>/);
    expect(html).toContain('class="rating-badge"');
    expect(html).toContain('class="rating-divider"');
    expect(html).toContain('<div class="rating-value-row"><span>RATING</span><strong>16.50</strong></div>');
    expect(html).toContain('class="trophy-slot"');
    expect(html).toContain('.profile-banner{position:absolute;z-index:1;left:43px;top:43px;width:540px;height:214px;border-radius:0');
    expect(html).toContain('.profile-banner .nameplate-image,.profile-banner .nameplate-fallback{position:absolute;inset:0;display:block;width:100%;height:100%;border-radius:0}');
    expect(html).toContain('.profile-banner .nameplate-image{object-fit:contain}');
    expect(html).toContain('.profile-spacer{grid-column:2/4;grid-row:1}');
    expect(html).toContain('.profile-banner .avatar{grid-column:3;grid-row:3;width:93.75px;height:93.75px;overflow:hidden;border-radius:0');
    expect(html).toContain('.rating-badge{grid-column:2;grid-row:3;display:flex;width:266.25px;height:93.75px;min-width:0;flex-direction:column;overflow:hidden;padding:4px 7px;border:1px solid transparent;border-radius:0');
    expect(html).toContain('.trophy-slot{grid-column:2/4;grid-row:2;display:flex;width:360px;height:46.875px;align-items:center;justify-content:flex-start;overflow:hidden;padding:0 7px;border:1px solid rgba(96,87,72,.35);border-radius:0');
    expect(html).toContain('.scores-content{position:absolute;z-index:1;left:43px;right:43px;top:295px');
    expect(html).not.toContain('class="meta-row"');
    expect(html).not.toMatch(/meta-row"><span>[^<]*虹/);
  });

  it('keeps the fixed player grid when trophy and character are disabled', () => {
    const html = buildChunithmBestImageHtml({
      type: 'best50',
      width: 1080,
      player: null,
      ratingDisplay: '0.00',
      hideCharacter: true,
      hideTrophy: true,
      page: {
        id: 'chunithm-page-0',
        pageIndex: 0,
        pageCount: 1,
        sections: [],
      },
    });

    expect(html).toContain('height:187.5px;display:grid;grid-template-columns:1fr 266.25px 93.75px;grid-template-rows:46.875px 46.875px 93.75px');
    expect(html).not.toContain('class="trophy-slot"');
    expect(html).not.toContain('class="avatar"');
    expect(html).toContain('class="player-level">Lv.—</span>');
    expect(html).toContain('class="player-name" id="player-name">未读取玩家资料</span>');
    expect(html).toContain('<div class="rating-value-row"><span>RATING</span><strong>0.00</strong></div>');
  });

  it('uses text and initial fallbacks without changing the grid', () => {
    const html = buildChunithmBestImageHtml({
      type: 'best50',
      width: 1080,
      player: null,
      ratingDisplay: '0.00',
      page: {
        id: 'chunithm-page-0',
        pageIndex: 0,
        pageCount: 1,
        sections: [],
      },
    });

    expect(html).toContain('<span class="trophy-fallback">称号未同步</span>');
    expect(html).toContain('<div class="avatar-fallback">未</div>');
    expect(html).toContain('const APP_NAME_MIN_SIZE = 14;');
    expect(html).toContain("playerName.style.transform = 'scaleX('");
  });
});

describe('parseChunithmBestImageStylePreferences', () => {
  it('accepts selectionCount 0/5/10', () => {
    expect(parseChunithmBestImageStylePreferences({ version: 1, selectionCount: 5 }).selectionCount).toBe(5);
    expect(parseChunithmBestImageStylePreferences({ version: 1, selectionCount: 10 }).selectionCount).toBe(10);
    expect(parseChunithmBestImageStylePreferences({ version: 1, selectionCount: 3 }).selectionCount).toBe(0);
  });

  it('migrates version 1 to version 2 defaults for character/plate/trophy', () => {
    const parsed = parseChunithmBestImageStylePreferences({ version: 1, selectionCount: 5 });
    expect(parsed).toMatchObject({
      version: 2,
      selectionCount: 5,
      character: { mode: 'current' },
      plate: { mode: 'current' },
      trophy: { mode: 'current' },
    });
  });

  it('parses version 2 character/plate/trophy modes', () => {
    expect(parseChunithmBestImageStylePreferences({
      version: 2,
      selectionCount: 10,
      character: { mode: 'off' },
      plate: { mode: 'item', id: 12, name: '测试名牌' },
      trophy: { mode: 'random', id: 34, name: '测试称号' },
    })).toEqual({
      version: 2,
      selectionCount: 10,
      character: { mode: 'off' },
      plate: { mode: 'item', id: 12, name: '测试名牌' },
      trophy: { mode: 'random', id: 34, name: '测试称号' },
    });
  });

  it('falls back invalid version 2 choices to current', () => {
    expect(parseChunithmBestImageStylePreferences({
      version: 2,
      selectionCount: 0,
      character: { mode: 'item', id: 'bad' },
      plate: { mode: 'random' },
      trophy: { mode: 'unknown' },
    })).toMatchObject({
      character: { mode: 'current' },
      plate: { mode: 'current' },
      trophy: { mode: 'current' },
    });
  });
});
