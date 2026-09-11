import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadChaptersTable } from '@/domain/phigros';
import { PhigrosCatalogProvider } from '@/providers/phigros-catalog-provider';
import { PHIGROS_OSS_BASE } from '@/domain/account-avatar';
import { PhigrosResourceService } from '@/services/phigros-resources';
import { releaseFixture } from './fixtures/phigros-release';

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 404,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

function textResponse(body: string, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 404,
    json: async () => ({}),
    text: async () => body,
  } as Response;
}

const SAMPLE_CSV = '\uFEFF'
  + '# Phigros 章节定义：章节变量,章节显示名\r\n'
  + 'legacy,Chapter Legacy 过去的章节\r\n'
  + 'c5,Chapter 5 霓虹灯牌\r\n'
  + '\r\n'
  + '# 歌曲章节映射：songId,章节变量\r\n'
  + 'SongA.Artist,legacy\r\n'
  + 'SongB.Composer,c5\r\n'
  + 'SongC.Ghost,unknown-chapter\r\n';

const SONG_A_CHAPTERS_V1 = 'legacy,Chapter Legacy 过去的章节\n# 歌曲章节映射：songId,章节变量\nSong.A,legacy\n';
const SONG_A_CHAPTERS_V2 = 'legacy,Chapter Legacy 过去的章节\nc5,Chapter 5 霓虹灯牌\n# 歌曲章节映射：songId,章节变量\nSong.A,c5\n';

function chaptersUrl(input: RequestInfo | URL): URL | undefined {
  const url = new URL(String(input));
  return url.pathname.endsWith('/chapters.csv') ? url : undefined;
}

describe('loadChaptersTable', () => {
  it('parses definitions and mapping with BOM, CRLF, comments and blank lines', () => {
    const table = loadChaptersTable(SAMPLE_CSV);
    expect(table?.definitions).toEqual([
      { key: 'legacy', title: 'Chapter Legacy 过去的章节' },
      { key: 'c5', title: 'Chapter 5 霓虹灯牌' },
    ]);
    expect(table?.songChapter).toEqual({
      'SongA.Artist': 'legacy',
      'SongB.Composer': 'c5',
    });
  });

  it('drops mapping rows referencing undefined chapters', () => {
    const table = loadChaptersTable(SAMPLE_CSV);
    expect(table?.songChapter['SongC.Ghost']).toBeUndefined();
  });

  it('keeps the first definition when keys repeat', () => {
    const table = loadChaptersTable('k,First\nk,Second\n# 歌曲章节映射：songId,章节变量\nSong.X,k');
    expect(table?.definitions).toEqual([{ key: 'k', title: 'First' }]);
    expect(table?.songChapter['Song.X']).toBe('k');
  });

  it('normalizes trailing .0 in song ids', () => {
    const table = loadChaptersTable('k,Chapter\n# 歌曲章节映射：songId,章节变量\nSong.X.0,k');
    expect(table?.songChapter['Song.X']).toBe('k');
  });

  it('returns null without definitions', () => {
    expect(loadChaptersTable('# only comments')).toBeNull();
  });

  it('returns null without the mapping marker comment', () => {
    expect(loadChaptersTable('k,Chapter\nSong.X,k')).toBeNull();
  });
});

describe('PhigrosCatalogProvider chapters', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function catalogJson(songs: unknown[]) {
    return jsonResponse({ schemaVersion: 1, songCount: songs.length, songs });
  }

  it('maps songs to chapter titles, versions and version ids', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/phigros/current.json')) {
        return jsonResponse({
          schemaVersion: 1,
          gameVersion: '3.19.4',
          catalog: 'phigros/releases/3.19.4/catalog.json',
          manifest: 'phigros/releases/3.19.4/manifest.json',
        });
      }
      if (url.endsWith('/catalog.json')) {
        return catalogJson([
          { id: 'SongA.Artist', title: 'A', composer: 'Artist', illustrator: 'I', charters: ['e'], difficulties: [2] },
          { id: 'SongB.Composer', title: 'B', composer: 'Composer', illustrator: 'I', charters: ['e'], difficulties: [3] },
          { id: 'SongD.None', title: 'D', composer: 'None', illustrator: 'I', charters: ['e'], difficulties: [2] },
        ]);
      }
      if (chaptersUrl(url)) {
        return textResponse(SAMPLE_CSV);
      }
      return textResponse('', false);
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = new PhigrosCatalogProvider();
    const catalog = await provider.getCatalog();
    expect(catalog.versions).toEqual([
      { id: 0, title: 'Chapter Legacy 过去的章节' },
      { id: 1, title: 'Chapter 5 霓虹灯牌' },
    ]);
    expect(catalog.currentVersion).toEqual({ id: 0, title: 'Chapter Legacy 过去的章节' });

    const a = catalog.songs.find((song) => song.id === 'SongA.Artist')!;
    const b = catalog.songs.find((song) => song.id === 'SongB.Composer')!;
    const d = catalog.songs.find((song) => song.id === 'SongD.None')!;
    expect(a.version).toBe('Chapter Legacy 过去的章节');
    expect(a.versionId).toBe(0);
    expect(a.charts[0]?.versionId).toBe(0);
    expect(b.version).toBe('Chapter 5 霓虹灯牌');
    expect(b.versionId).toBe(1);
    expect(b.charts[0]?.versionId).toBe(1);
    expect(d.version).toBe('');
    expect(d.versionId).toBeUndefined();
    expect(d.charts[0]?.versionId).toBeUndefined();
    expect(catalog.chartVersionIndex).toEqual({
      'SongA.Artist': 0,
      'SongB.Composer': 1,
    });
    expect('SongD.None' in catalog.chartVersionIndex).toBe(false);
  });

  it('falls back to game version when chapters.csv is unavailable', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/phigros/current.json')) {
        return jsonResponse({
          schemaVersion: 1,
          gameVersion: '3.19.4',
          catalog: 'phigros/releases/3.19.4/catalog.json',
          manifest: 'phigros/releases/3.19.4/manifest.json',
        });
      }
      if (url.endsWith('/catalog.json')) {
        return catalogJson([
          { id: 'SongA.Artist', title: 'A', composer: 'Artist', illustrator: 'I', charters: ['e'], difficulties: [2] },
        ]);
      }
      return textResponse('', false);
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = new PhigrosCatalogProvider();
    const catalog = await provider.getCatalog();
    expect(catalog.versions).toEqual([{ id: 0, title: '3.19.4' }]);
    expect(catalog.songs[0]?.version).toBe('3.19.4');
    expect(catalog.songs[0]?.versionId).toBeUndefined();
    expect(catalog.chartVersionIndex).toEqual({ 'SongA.Artist': 0 });
  });

  it('requests chapters from the fixed chapters.csv path', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/phigros/current.json')) {
        return jsonResponse({
          schemaVersion: 1,
          gameVersion: '3.19.4',
          catalog: 'phigros/releases/3.19.4/catalog.json',
          manifest: 'phigros/releases/3.19.4/manifest.json',
        });
      }
      if (url.endsWith('/catalog.json')) return catalogJson([]);
      if (chaptersUrl(url)) return textResponse(SAMPLE_CSV);
      return textResponse('', false);
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = new PhigrosCatalogProvider();
    await provider.getCatalog();
    expect(fetchMock.mock.calls.some(([url]) =>
      String(url) === `${PHIGROS_OSS_BASE}/phigros/chapters.csv`)).toBe(true);
  });
});

describe('PhigrosCatalogProvider chapters recheck', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function chapterCalls(fetchMock: ReturnType<typeof vi.fn>) {
    return fetchMock.mock.calls
      .map(([input]) => chaptersUrl(input as RequestInfo | URL))
      .filter((url): url is URL => url !== undefined);
  }

  function setup(csv: { current: string | null }) {
    const fixture = releaseFixture();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (chaptersUrl(input)) {
        return csv.current === null
          ? new Response('', { status: 404 })
          : new Response(csv.current);
      }
      return fixture.respond(input);
    });
    vi.stubGlobal('fetch', fetchMock);
    const resources = new PhigrosResourceService('https://example.com');
    return { fetchMock, provider: new PhigrosCatalogProvider(resources) };
  }

  it('reuses the catalog snapshot without refetching chapters on the same release', async () => {
    const { fetchMock, provider } = setup({ current: SONG_A_CHAPTERS_V1 });
    const first = await provider.getCatalog();
    expect(first.songs[0]?.version).toBe('Chapter Legacy 过去的章节');
    expect(chapterCalls(fetchMock)).toHaveLength(1);
    expect(await provider.getCatalog()).toBe(first);
    expect(chapterCalls(fetchMock)).toHaveLength(1);
  });

  it('rechecks chapters with a cache-busting query and keeps the snapshot when unchanged', async () => {
    const { fetchMock, provider } = setup({ current: SONG_A_CHAPTERS_V1 });
    const first = await provider.getCatalog();
    const second = await provider.getCatalog(undefined, true);
    expect(second).toBe(first);
    const checks = chapterCalls(fetchMock);
    expect(checks).toHaveLength(2);
    expect(checks[0]?.searchParams.has('_check')).toBe(false);
    expect(checks[1]?.searchParams.has('_check')).toBe(true);
    expect(checks[1]?.pathname).toBe('/phigros/chapters.csv');
  });

  it('rebuilds chapter titles and version ids when chapters.csv changes on the same release', async () => {
    const csv = { current: SONG_A_CHAPTERS_V1 as string | null };
    const { provider } = setup(csv);
    const first = await provider.getCatalog();
    expect(first.songs[0]?.version).toBe('Chapter Legacy 过去的章节');
    expect(first.songs[0]?.versionId).toBe(0);
    csv.current = SONG_A_CHAPTERS_V2;
    const second = await provider.getCatalog(undefined, true);
    expect(second).not.toBe(first);
    expect(second.versions).toEqual([
      { id: 0, title: 'Chapter Legacy 过去的章节' },
      { id: 1, title: 'Chapter 5 霓虹灯牌' },
    ]);
    expect(second.songs[0]?.version).toBe('Chapter 5 霓虹灯牌');
    expect(second.songs[0]?.versionId).toBe(1);
    expect(second.chartVersionIndex['Song.A']).toBe(1);
  });

  it('keeps previous chapters when a recheck fails instead of falling back to the game version', async () => {
    const csv = { current: SONG_A_CHAPTERS_V1 as string | null };
    const { provider } = setup(csv);
    const first = await provider.getCatalog();
    csv.current = null;
    const second = await provider.getCatalog(undefined, true);
    expect(second).toBe(first);
    expect(second.songs[0]?.version).toBe('Chapter Legacy 过去的章节');
    expect(second.versions[0]?.title).not.toBe('9.9.9');
  });
});

vi.mock('@/services/phigros-resources', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/phigros-resources')>();
  return {
    ...actual,
    phigrosResources: {
      peek: () => undefined,
      load: async () => {
        const current = await (await fetch(`${PHIGROS_OSS_BASE}/phigros/current.json`)).json();
        const catalog = await (await fetch(`${PHIGROS_OSS_BASE}/${current.catalog}`)).json();
        return { current, catalog, noteCounts: '', fetchedAt: new Date().toISOString() };
      },
      bytes: async (url: string) => {
        const response = await fetch(url);
        if (!response.ok) throw new Error('unavailable');
        return new TextEncoder().encode(await response.text());
      },
    },
  };
});
