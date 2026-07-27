import type { ChunithmCatalogSnapshot } from '@/domain/chunithm';
import {
  ChunithmCatalogProvider,
  mapChunithmCatalog,
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

  it("filters WORLD'S END charts and removes entertainment-only songs", () => {
    const catalog = mapChunithmCatalog(responsePayload);
    expect(catalog.songs.map((song) => song.id)).toEqual([3]);
    expect(catalog.songs.flatMap((song) => song.difficulties))
      .not.toContainEqual(expect.objectContaining({ difficulty: 5 }));
  });

  it('rejects an invalid upstream envelope', () => {
    expect(() => mapChunithmCatalog({
      songs: responsePayload.songs,
      genres: responsePayload.genres,
      versions: [],
    })).toThrow(expect.objectContaining({ code: 'upstream_schema' }));
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
    expect(result.songs).toHaveLength(1);
  });
});
