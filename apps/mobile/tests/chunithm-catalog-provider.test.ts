import type {
  ChunithmCatalogSnapshot,
  ChunithmSongDetailSnapshot,
} from '@/domain/chunithm';
import {
  ChunithmCatalogProvider,
  mapChunithmCatalog,
  mapChunithmSongDetail,
} from '@/providers/chunithm-catalog-provider';
import { ResourceService } from '@/services/resource-service';
import type { ResourceRepository } from '@/repositories/resource-repository';

const responsePayload = {
  versions: [
    { id: 18, title: 'CHUNITHM LUMINOUS PLUS', version: 22000 },
    { id: 19, title: 'CHUNITHM VERSE', version: 23000 },
  ],
  genres: [{ id: 1, genre: '其他游戏' }],
  songs: [
    {
      id: 3,
      title: 'B.B.K.K.B.K.K.',
      artist: 'nora2r',
      genre: '其他游戏',
      bpm: 170,
      version: 23001,
      locked: true,
      difficulties: [
        {
          difficulty: 0,
          level: '3',
          level_value: 3,
          note_designer: 'ロシェ＠ペンギン',
          version: 23001,
        },
        {
          difficulty: 4,
          level: '13+',
          level_value: 13.7,
          note_designer: null,
          version: 23001,
        },
      ],
    },
    {
      id: 90001,
      title: 'WORLD END TEST',
      artist: null,
      genre: 'WORLD END',
      bpm: 200,
      version: 22000,
      disabled: true,
      difficulties: [
        {
          difficulty: 5,
          level: '避',
          level_value: 14,
          note_designer: 'WE Designer',
          version: 22000,
          origin_id: 1234,
          kanji: '避',
          star: 4,
        },
      ],
    },
  ],
};

const detailPayload = {
  ...responsePayload.songs[0],
  map: '未来都市',
  rights: 'TEST RIGHTS',
  difficulties: [
    {
      ...responsePayload.songs[0]!.difficulties[0],
      notes: { total: 333, tap: 219, hold: 24, slide: 48, air: 42, flick: 0 },
    },
    {
      difficulty: 5,
      level: '0',
      level_value: 0,
      note_designer: 'WE Designer',
      version: 22000,
      origin_id: 163,
      kanji: '止',
      star: 1,
      notes: { total: 1244, tap: 606, hold: 319, slide: 209, air: 110, flick: 0 },
    },
  ],
};

describe('ChunithmCatalogProvider', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('fetches the public song list without auth or maimai query parameters', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify(responsePayload),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ));
    vi.stubGlobal('fetch', fetchMock);

    const catalog = await new ChunithmCatalogProvider().getCatalog();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      'https://maimai.lxns.net/api/v0/chunithm/song/list',
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: { Accept: 'application/json' },
    });
    expect(catalog.currentVersion).toEqual({ id: 23000, title: 'CHUNITHM VERSE' });
  });

  it('keeps flat Chunithm difficulties and maps minor versions down', () => {
    const catalog = mapChunithmCatalog(responsePayload);
    expect(catalog.songs[0]).toMatchObject({
      id: 3,
      versionId: 23000,
      versionTitle: 'CHUNITHM VERSE',
      locked: true,
      disabled: false,
    });
    expect(catalog.songs[0]?.difficulties).toEqual([
      expect.objectContaining({
        difficulty: 0,
        level: '3',
        levelValue: 3,
        noteDesigner: 'ロシェ＠ペンギン',
        versionId: 23000,
      }),
      expect.objectContaining({
        difficulty: 4,
        level: '13+',
        levelValue: 13.7,
        noteDesigner: undefined,
      }),
    ]);
  });

  it("keeps WORLD'S END charts with their dedicated display metadata", () => {
    const catalog = mapChunithmCatalog(responsePayload);
    expect(catalog.songs.map((song) => song.id)).toEqual([3, 90001]);
    expect(catalog.songs[1]?.difficulties).toEqual([
      expect.objectContaining({
        difficulty: 5,
        originId: 1234,
        kanji: '避',
        star: 4,
        levelValue: 14,
      }),
    ]);
  });

  it('rejects an invalid upstream envelope', () => {
    expect(() => mapChunithmCatalog({
      songs: responsePayload.songs,
      genres: responsePayload.genres,
      versions: [],
    })).toThrow(expect.objectContaining({ code: 'upstream_schema' }));
  });

  it('fetches and maps unauthenticated song detail notes including WORLD’S END', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify(detailPayload),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ));
    vi.stubGlobal('fetch', fetchMock);

    const detail = await new ChunithmCatalogProvider().getSongDetail(3);

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      'https://maimai.lxns.net/api/v0/chunithm/song/3',
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: { Accept: 'application/json' },
    });
    expect(fetchMock.mock.calls[0]?.[1]?.headers).not.toHaveProperty('Authorization');
    expect(detail.song).toMatchObject({
      id: 3,
      map: '未来都市',
      rights: 'TEST RIGHTS',
    });
    expect(detail.song.difficulties[0]?.notes).toEqual({
      total: 333,
      tap: 219,
      hold: 24,
      slide: 48,
      air: 42,
      flick: 0,
    });
    expect(detail.song.difficulties[1]).toMatchObject({
      difficulty: 5,
      originId: 163,
      kanji: '止',
      star: 1,
      levelValue: 0,
      notes: { total: 1244 },
    });
  });

  it('maps a missing song detail response to the no-data error state', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })));

    await expect(new ChunithmCatalogProvider().getSongDetail(404)).rejects.toMatchObject({
      code: 'no_data',
    });
  });

  it('rejects malformed song detail and supports resource cache fallback', async () => {
    expect(() => mapChunithmSongDetail({ id: 3, title: 'broken' }))
      .toThrow(expect.objectContaining({ code: 'upstream_schema' }));
    const cached = mapChunithmSongDetail(detailPayload);
    const repository: ResourceRepository = {
      saveResource: async () => undefined,
      getResource: async <T>() => cached as T,
      deleteResource: async () => undefined,
    };
    const result = await new ResourceService(repository).load<ChunithmSongDetailSnapshot>(
      'chunithm-song-detail:3',
      1,
      async () => {
        throw new Error('network');
      },
    );
    expect(result.source).toMatchObject({ kind: 'cache', isStale: true });
    expect(result.song.difficulties[0]?.notes?.total).toBe(333);
  });

  it('falls back to the game-specific cached resource when the network fails', async () => {
    const cached = mapChunithmCatalog(responsePayload);
    const getResource = vi.fn(async () => cached);
    const repository: ResourceRepository = {
      saveResource: async () => undefined,
      getResource: async <T>() => await getResource() as T,
      deleteResource: async () => undefined,
    };
    const service = new ResourceService(repository);

    const result = await service.load<ChunithmCatalogSnapshot>(
      'chunithm-catalog',
      2,
      async () => {
      throw new Error('network');
      },
    );

    expect(getResource).toHaveBeenCalledTimes(1);
    expect(result.source).toMatchObject({ kind: 'cache', isStale: true });
    expect(result.songs).toHaveLength(2);
  });
});
