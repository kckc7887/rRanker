import { describe, expect, it, vi } from 'vitest';
import type { ChunithmScoreCardData } from '@/domain/chunithm-score-presentation';
import {
  appendChunithmSelectionScores,
  paginateChunithmBestImageSections,
} from '@/features/chunithm-best-image/chunithm-best-image';
import { buildChunithmBestImageHtml } from '@/features/chunithm-best-image/build-chunithm-best-image-html';
import { filterChunithmBestImageBackgroundSongs } from '@/features/chunithm-best-image/chunithm-best-image-background';
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
  it('renders the compact possession card, song background, and score fields', () => {
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
      characterDataUri: 'data:image/png;base64,character',
      backgroundDataUri: 'data:image/png;base64,background',
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
    expect(html).toContain('class="background-image"');
    expect(html).toContain('src="data:image/png;base64,background"');
    expect(html).toContain('filter:blur(12px);transform:scale(1.04)');
    expect(html).toContain('.background-veil{position:absolute;inset:0;background:rgba(238,242,248,.52)}');
    expect(html).toContain('class="profile-card"');
    expect(html).toContain('.profile-card{position:absolute;z-index:2;left:43px;top:43px;display:grid;width:360px;height:112px');
    expect(html).toContain('grid-template-columns:80px 1px minmax(0,1fr);column-gap:14px');
    expect(html).toContain('padding:16px;border:1px solid var(--tag-outline);border-radius:16px');
    expect(html).toContain('--tag-fill:linear-gradient(90deg,#FF9CA8 0%');
    expect(html).toContain('--rating-outline:-1px -1px 0 #FF2D95,0px -1px 0 #FF6B00');
    expect(html).toContain('text-shadow:var(--rating-outline)');
    expect(html).toContain('.profile-card::before{position:absolute;z-index:0;inset:0;background:var(--tag-fill);content:"";opacity:.28}');
    expect(html).not.toMatch(/\.player-name\{[^}]*text-shadow/);
    expect(html).toContain('border-radius:16px;background:transparent');
    expect(html).not.toContain('var(--tag-border) border-box');
    expect(html).not.toContain('backdrop-filter');
    expect(html).toContain('class="avatar"');
    expect(html).toContain('class="avatar-image"');
    expect(html).toContain('src="data:image/png;base64,character"');
    expect(html).toContain('.avatar-image{display:block;width:100%;height:100%;object-fit:contain;object-position:center}');
    expect(html).toContain('class="profile-divider"');
    expect(html).toContain('class="player-name-row"');
    expect(html).toContain('class="player-name" id="player-name">测试玩家</span>');
    expect(html).toContain('<div class="rating-value-row"><span>RATING</span><strong>16.50</strong></div>');
    expect(html).toContain('.scores-content{position:absolute;z-index:1;left:43px;right:43px;top:193px');
    expect(html).not.toContain('player-level');
    expect(html).not.toContain('nameplate');
    expect(html).not.toContain('trophy');
    expect(html).not.toContain('rating-divider');
    expect(html).not.toContain('class="meta-row"');
  });

  it('shrinks the card and removes the avatar column when character is disabled', () => {
    const html = buildChunithmBestImageHtml({
      type: 'best50',
      width: 1080,
      player: null,
      ratingDisplay: '0.00',
      hideCharacter: true,
      page: {
        id: 'chunithm-page-0',
        pageIndex: 0,
        pageCount: 1,
        sections: [],
      },
    });

    expect(html).toContain('class="profile-card no-avatar"');
    expect(html).toContain('width:252px;height:112px');
    expect(html).toContain('.profile-card.no-avatar{grid-template-columns:minmax(0,1fr)}');
    expect(html).not.toContain('class="avatar"');
    expect(html).not.toContain('class="profile-divider"');
    expect(html).toContain('class="player-name" id="player-name">未读取玩家资料</span>');
    expect(html).toContain('<div class="rating-value-row"><span>RATING</span><strong>0.00</strong></div>');
  });

  it('uses the default background and player initial fallbacks', () => {
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

    expect(html).not.toContain('class="background-image"');
    expect(html).toContain('linear-gradient(145deg,#EEF2F8 0%,#E7EDF5 52%,#F5F7FA 100%)');
    expect(html).toContain('<div class="avatar-fallback">未</div>');
    expect(html).toContain('const APP_NAME_MIN_SIZE = 17;');
    expect(html).toContain("playerName.style.transform = 'scaleX('");
  });
});

describe('parseChunithmBestImageStylePreferences', () => {
  it('accepts selectionCount 0/5/10', () => {
    expect(parseChunithmBestImageStylePreferences({ version: 1, selectionCount: 5 }).selectionCount).toBe(5);
    expect(parseChunithmBestImageStylePreferences({ version: 1, selectionCount: 10 }).selectionCount).toBe(10);
    expect(parseChunithmBestImageStylePreferences({ version: 1, selectionCount: 3 }).selectionCount).toBe(0);
  });

  it('migrates version 1 to version 3 defaults', () => {
    const parsed = parseChunithmBestImageStylePreferences({ version: 1, selectionCount: 5 });
    expect(parsed).toMatchObject({
      version: 3,
      selectionCount: 5,
      character: { mode: 'current' },
      background: { mode: 'default' },
    });
  });

  it('migrates version 2 while discarding plate and trophy choices', () => {
    expect(parseChunithmBestImageStylePreferences({
      version: 2,
      selectionCount: 10,
      character: { mode: 'off' },
      plate: { mode: 'item', id: 12, name: '测试名牌' },
      trophy: { mode: 'random', id: 34, name: '测试称号' },
    })).toEqual({
      version: 3,
      selectionCount: 10,
      character: { mode: 'off' },
      background: { mode: 'default' },
    });
  });

  it('parses version 3 song backgrounds and falls back invalid values', () => {
    expect(parseChunithmBestImageStylePreferences({
      version: 3,
      selectionCount: 5,
      character: { mode: 'item', id: 42, name: '角色' },
      background: { mode: 'song', songId: 1234 },
    })).toEqual({
      version: 3,
      selectionCount: 5,
      character: { mode: 'item', id: 42, name: '角色' },
      background: { mode: 'song', songId: 1234 },
    });
    expect(parseChunithmBestImageStylePreferences({
      version: 3,
      selectionCount: 0,
      character: { mode: 'item', id: 'bad' },
      background: { mode: 'song', songId: -1 },
    })).toMatchObject({
      character: { mode: 'current' },
      background: { mode: 'default' },
    });
  });
});

describe('filterChunithmBestImageBackgroundSongs', () => {
  const songs = [
    {
      id: 101,
      title: 'World Vanquisher',
      artist: 'void',
      genre: 'ORIGINAL',
      bpm: 170,
      versionId: 1,
      versionTitle: 'CHUNITHM',
      locked: false,
      disabled: false,
      difficulties: [],
    },
    {
      id: 202,
      title: '光線チューニング',
      artist: 'ナユタン星人',
      genre: 'POPS & ANIME',
      bpm: 190,
      versionId: 2,
      versionTitle: 'STAR',
      locked: false,
      disabled: false,
      difficulties: [],
    },
  ];

  it('searches background songs by title, artist, and id', () => {
    expect(filterChunithmBestImageBackgroundSongs(songs, 'world')).toEqual([songs[0]]);
    expect(filterChunithmBestImageBackgroundSongs(songs, 'ナユタン')).toEqual([songs[1]]);
    expect(filterChunithmBestImageBackgroundSongs(songs, '202')).toEqual([songs[1]]);
    expect(filterChunithmBestImageBackgroundSongs(songs, '')).toBe(songs);
  });
});
