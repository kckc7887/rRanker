import { pollForToken } from '@/providers/phigros-auth';
import { ProviderError } from '@/providers/errors';

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

  it('throws a retryable network error on 5xx without parsing HTML body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response('<html>502 Bad Gateway</html>', { status: 502 }),
    ));

    await expect(pollForToken('code', 'dev')).rejects.toMatchObject({
      name: 'ProviderError',
      code: 'network',
      retryable: true,
    });
  });

  it('throws a retryable network error on 429', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      success: false,
      data: { error: 'slow_down' },
    }, 429)));

    await expect(pollForToken('code', 'dev')).rejects.toMatchObject({
      name: 'ProviderError',
      code: 'network',
      retryable: true,
    });
  });

  it('throws a non-retryable network error on other 4xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      success: false,
      data: { error: 'invalid_grant' },
    }, 400)));

    await expect(pollForToken('code', 'dev')).rejects.toMatchObject({
      name: 'ProviderError',
      code: 'network',
      retryable: false,
    });
    await expect(pollForToken('code', 'dev')).rejects.toBeInstanceOf(ProviderError);
  });
});
