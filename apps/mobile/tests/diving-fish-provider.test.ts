import { DivingFishProvider } from '@/providers/diving-fish-provider';

describe('DivingFishProvider native cookie session', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('uses expo/fetch credentials include so iOS reuses the login cookie jar', async () => {
    const request = vi.fn().mockResolvedValue(new Response('{"ok":true}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', request);

    const result = await new DivingFishProvider({ mode: 'cookie-jar', persistable: false }).getChartStats();

    expect(result).toEqual({ ok: true });
    expect(request).toHaveBeenCalledWith(expect.stringContaining('/chart_stats'), expect.objectContaining({
      credentials: 'include',
      headers: { Accept: 'application/json' },
    }));
  });

  it('isolates an extracted JWT from stale native cookies', async () => {
    const request = vi.fn().mockResolvedValue(new Response('{"ok":true}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', request);

    await new DivingFishProvider({ mode: 'jwt', value: 'fresh-jwt', persistable: true }).getChartStats();

    expect(request).toHaveBeenCalledWith(expect.stringContaining('/chart_stats'), expect.objectContaining({
      credentials: 'omit',
      headers: { Accept: 'application/json', Cookie: 'jwt_token=fresh-jwt' },
    }));
  });

  it('includes the failing endpoint in provider errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 403 })));

    const promise = new DivingFishProvider({ mode: 'jwt', value: 'fresh-jwt', persistable: true }).getPlayer();

    await expect(promise).rejects.toMatchObject({ code: 'permission', message: expect.stringContaining('/player/profile') });
  });

  it('validates Import-Token from one shared records request without assuming profile access', async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      username: 'masked-user', nickname: '脱敏玩家', plate: '测试称号', rating: 12345, records: [],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', request);
    const provider = new DivingFishProvider({ mode: 'import-token', value: 'fake-token', persistable: true });

    const [player, records] = await Promise.all([provider.getPlayer(), provider.getRecords()]);

    expect(player).toMatchObject({
      id: 'masked-user', displayName: '脱敏玩家', rating: 12345,
      presentation: { trophyName: '测试称号' },
    });
    expect(records).toEqual([]);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(expect.stringContaining('/player/records'), expect.objectContaining({
      headers: { Accept: 'application/json', 'Import-Token': 'fake-token' },
    }));
  });
});
