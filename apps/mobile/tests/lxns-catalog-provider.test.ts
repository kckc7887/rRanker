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

  it('keeps SD and DX introduction versions separate on the same song', async () => {
    const crossVersionSong = {
      id: 363,
      title: 'Oshama Scramble!',
      artist: 't+pazolite',
      version: 15000,
      difficulties: {
        standard: [{
          type: 'standard',
          difficulty: 3,
          level: '13',
          level_value: 13.4,
          version: 15000,
          note_designer: 'SD谱师',
          notes: null,
        }],
        dx: [{
          type: 'dx',
          difficulty: 3,
          level: '13+',
          level_value: 13.7,
          version: 25500,
          note_designer: 'DX谱师',
          notes: null,
        }],
      },
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ...responsePayload,
      songs: [crossVersionSong],
    }), { status: 200 })));

    const catalog = await new LxnsCatalogProvider().getCatalog();
    const song = catalog.songs[0];

    expect(song).toMatchObject({ versionId: 15000, version: 'ORANGE PLUS' });
    expect(song.charts.find((chart) => chart.type === 'SD')).toMatchObject({ versionId: 15000 });
    expect(song.charts.find((chart) => chart.type === 'DX')).toMatchObject({ versionId: 25500 });
    expect(catalog.chartVersionIndex[chartVersionKey(363, 'SD', 3)]).toBe(15000);
    expect(catalog.chartVersionIndex[chartVersionKey(363, 'DX', 3)]).toBe(25500);
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

  it('maps U·TA·GE metadata and BUDDY notes without treating level index 0 as BASIC', async () => {
    const utageSongs = [
      {
        id: 122,
        title: '原曲',
        artist: '原曲曲师',
        bpm: 222,
        genre: '原曲分类',
        map: '原曲区域',
        rights: '原曲版权',
        version: 15000,
        difficulties: { standard: [], dx: [] },
      },
      {
        id: 100122,
        title: '[光] U·TA·GE',
        artist: '测试曲师',
        version: 25500,
        difficulties: {
          standard: [],
          dx: [],
          utage: [{
            type: 'utage',
            difficulty: 4,
            level: '宴',
            level_value: 0,
            version: 25500,
            note_designer: '宴谱师',
            kanji: '光',
            description: '普通说明',
            is_buddy: false,
            notes: { total: 100, tap: 50, hold: 10, slide: 20, touch: 10, break: 10 },
          }],
        },
      },
      {
        id: 100123,
        title: '協 U·TA·GE',
        artist: '测试曲师',
        version: 25500,
        difficulties: {
          standard: [],
          dx: [],
          utage: [{
            type: 'utage',
            difficulty: 0,
            level: '宴',
            level_value: 0,
            version: 25500,
            note_designer: '協谱师',
            kanji: '協',
            description: '两人协力',
            is_buddy: true,
            notes: {
              left: { total: 101, tap: 51, hold: 10, slide: 20, touch: 10, break: 10 },
              right: { total: 102, tap: 52, hold: 10, slide: 20, touch: 10, break: 10 },
            },
          }],
        },
      },
    ];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ...responsePayload,
      songs: [...responsePayload.songs, ...utageSongs],
    }), { status: 200 })));

    const catalog = await new LxnsCatalogProvider().getDetailedCatalog();
    const regularSong = catalog.songs.find((song) => song.id === '100122');
    const regular = regularSong?.charts[0];
    const buddy = catalog.songs.find((song) => song.id === '100123')?.charts[0];

    expect(regular).toMatchObject({
      type: 'UTAGE',
      levelIndex: 0,
      difficulty: 'utage',
      utage: { kanji: '光', description: '普通说明', isBuddy: false },
      notes: { total: 100 },
    });
    expect(regularSong).toMatchObject({
      title: 'U·TA·GE',
      artist: '原曲曲师',
      bpm: 222,
      genre: '原曲分类',
      region: '原曲区域',
      rights: '原曲版权',
      versionId: 15000,
      version: 'ORANGE PLUS',
    });
    expect(buddy).toMatchObject({
      type: 'UTAGE',
      levelIndex: 0,
      difficulty: 'utage',
      utage: { kanji: '協', description: '两人协力', isBuddy: true },
      notes: { left: { total: 101 }, right: { total: 102 } },
    });
    expect(catalog.chartVersionIndex[chartVersionKey(100123, 'UTAGE', 0)]).toBe(25500);
  });

  it('merges trophy/icon/plate/frame lists into one collection snapshot', async () => {
    const required = [{ difficulties: [0, 1, 2, 3], songs: [{ id: 1424, title: 'Estahv', type: 'dx' as const }] }];
    const byKind: Record<string, unknown> = {
      trophy: { trophies: [{ id: 1, name: 'Trophy', color: 'Normal', required }] },
      icon: { icons: [{ id: 255406, name: 'Feryquitous', required }] },
      plate: { plates: [{ id: 9, name: 'Plate', required }] },
      frame: { frames: [{ id: 3, name: 'Frame', required }] },
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      // Prefer longer path segments so /frame/ does not collide with other substrings.
      const kind = (['trophy', 'icon', 'plate', 'frame'] as const).find((item) => url.includes(`/maimai/${item}/list`));
      if (!kind) return new Response(JSON.stringify({}), { status: 200 });
      return new Response(JSON.stringify(byKind[kind]), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const snapshot = await new LxnsCatalogProvider().getCollections();
    expect(snapshot.items.map((item) => ({ kind: item.kind, id: item.id }))).toEqual([
      { kind: 'trophy', id: 1 },
      { kind: 'icon', id: 255406 },
      { kind: 'plate', id: 9 },
      { kind: 'frame', id: 3 },
    ]);
    expect(snapshot.items[1]).toMatchObject({
      id: 255406, kind: 'icon', name: 'Feryquitous',
      requirements: [{ difficulties: [0, 1, 2, 3], songs: ['1424'], songTypes: { 1424: 'DX' } }],
    });
  });

  it('can fetch only preview-style collections without heavy requirement payloads', async () => {
    const byKind: Record<string, unknown> = {
      trophy: { trophies: [{ id: 1, name: 'Trophy', color: 'Gold' }] },
      icon: { icons: [{ id: 2, name: 'Icon' }] },
      plate: { plates: [{ id: 3, name: 'Plate' }] },
      frame: { frames: [{ id: 4, name: 'Frame' }] },
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const kind = (['trophy', 'icon', 'plate', 'frame'] as const).find((item) => url.includes(`/maimai/${item}/list`));
      return new Response(JSON.stringify(kind ? byKind[kind] : {}), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const snapshot = await new LxnsCatalogProvider().getCollections({
      kinds: ['icon', 'plate', 'trophy', 'frame'],
      required: false,
    });

    expect(snapshot.items.map((item) => item.kind)).toEqual(['icon', 'plate', 'trophy', 'frame']);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls.map(([input]) => String(input))).not.toContainEqual(expect.stringContaining('required=true'));
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
