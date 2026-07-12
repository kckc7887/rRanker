import { chartVersionKey } from '@/domain/catalog';
import { LxnsCatalogProvider } from '@/providers/lxns-catalog-provider';

const responsePayload = {
  versions: [
    { id: 23, title: '舞萌DX 2025', version: 25000 },
    { id: 24, title: '舞萌DX 2026', version: 25500 },
  ],
  songs: [{
    id: 1806,
    title: 'Fraq',
    artist: 'Team Grimoire + あま猫',
    version: 25500,
    difficulties: {
      standard: [],
      dx: [{ type: 'dx', difficulty: 3, level: '13+', level_value: 13.7, version: 25500 }],
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
    expect(catalog.songs[0]).toMatchObject({ id: '1806', title: 'Fraq', version: '舞萌DX 2026' });
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
