import { chartVersionKey } from '@/domain/catalog';
import { LxnsCatalogProvider } from '@/providers/lxns-catalog-provider';

const responsePayload = {
  versions: [
    { id: 5, title: 'ORANGE PLUS', version: 15000 },
    { id: 23, title: '舞萌DX 2025', version: 25000 },
    { id: 24, title: '舞萌DX 2026', version: 25500 },
  ],
  songs: [{
    id: 1806,
    title: 'Fraq',
    artist: 'Team Grimoire + あま猫',
    map: '未来都市',
    version: 25500,
    difficulties: {
      standard: [],
      dx: [{ type: 'dx', difficulty: 3, level: '13+', level_value: 13.7, version: 25500,
        note_designer: '谱师', notes: { total: 1000, tap: 500, hold: 100, slide: 100, touch: 80, break: 20 } }],
    },
  }],
};

describe('LxnsCatalogProvider', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('uses the highest validated version and exposes chart-level versions', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(responsePayload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })));

    const catalog = await new LxnsCatalogProvider().getCatalog();

    expect(catalog.currentVersion).toEqual({ id: 25500, title: '舞萌DX 2026' });
    expect(catalog.chartVersionIndex[chartVersionKey(11806, 'DX', 3)]).toBe(25500);
    expect(catalog.songs[0]).toMatchObject({ id: '1806', title: 'Fraq', version: '舞萌DX 2026', region: '未来都市' });
  });

  it('parses detailed notes, aliases and plate requirements independently', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(responsePayload), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ aliases: [{ song_id: 1806, aliases: ['测试别名'] }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ plates: [{ id: 1, name: '舞舞舞', required: [{ difficulties: [], rate: 'sss', fc: null, fs: null, songs: [{ id: 1806, title: 'Fraq', type: 'dx' }] }] }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const provider = new LxnsCatalogProvider();
    const catalog = await provider.getDetailedCatalog();
    const aliases = await provider.getAliases();
    const plates = await provider.getPlates();
    expect(catalog.songs[0].charts[0]).toMatchObject({ charter: '谱师', notes: { total: 1000, break: 20 } });
    expect(aliases.aliases[0]).toEqual({ songId: '1806', aliases: ['测试别名'] });
    expect(plates.plates[0].requirements[0]).toMatchObject({ difficulties: [], songs: ['1806'], songTypes: { 1806: 'DX' } });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('maps LXNS minor release ids down to the nearest declared main version', async () => {
    const song363 = {
      id: 363, title: 'Oshama Scramble!', artist: 't+pazolite', version: 15007,
      difficulties: {
        standard: [{ type: 'standard', difficulty: 3, level: '13', level_value: 13.4,
          version: 15007, note_designer: 'mai-Star', notes: null }],
        dx: [],
      },
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ...responsePayload, songs: [...responsePayload.songs, song363],
    }), { status: 200 })));

    const catalog = await new LxnsCatalogProvider().getCatalog();
    const song = catalog.songs.find((item) => item.id === '363');

    expect(song).toMatchObject({ versionId: 15000, version: 'ORANGE PLUS' });
    expect(song?.charts[0]).toMatchObject({ versionId: 15000 });
    expect(catalog.chartVersionIndex[chartVersionKey(363, 'SD', 3)]).toBe(15000);
  });

  it('rejects a highest version with no matching chart', async () => {
    const invalid = {
      ...responsePayload,
      versions: [...responsePayload.versions, { id: 25, title: '未来版本', version: 26000 }],
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(invalid), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })));

    await expect(new LxnsCatalogProvider().getCatalog()).rejects.toMatchObject({ code: 'upstream_schema' });
  });
});
