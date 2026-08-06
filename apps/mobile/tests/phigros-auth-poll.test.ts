import { pollForToken } from '@/providers/phigros-auth';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('pollForToken', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns the token on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      success: true,
      data: { kid: 'k1', access_token: 'at', mac_key: 'mk' },
    })));

    await expect(pollForToken('code', 'dev')).resolves.toEqual({
      kid: 'k1',
      access_token: 'at',
      mac_key: 'mk',
    });
  });

  it('returns pending / waiting without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      success: false,
      data: { error: 'authorization_pending' },
    })));
    await expect(pollForToken('code', 'dev')).resolves.toBe('pending');

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      success: false,
      data: { error: 'authorization_waiting' },
    })));
    await expect(pollForToken('code', 'dev')).resolves.toBe('waiting');
  });

  it('treats slow_down as a non-fatal slowdown status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      success: false,
      data: { error: 'slow_down' },
    })));

    await expect(pollForToken('code', 'dev')).resolves.toBe('slowdown');
  });

  it('still throws on unknown errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      success: false,
      data: { error: 'access_denied' },
    })));

    await expect(pollForToken('code', 'dev')).rejects.toThrow('access_denied');
  });
});
