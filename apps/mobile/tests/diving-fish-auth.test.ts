import { DivingFishAuthProvider } from '@/providers/diving-fish-auth';
import { ProviderError } from '@/providers/errors';

function jsonResponse(body: unknown, init?: ResponseInit & { cookies?: string }) {
  const headers = new Headers(init?.headers);
  headers.set('Content-Type', 'application/json');
  if (init?.cookies) headers.set('Set-Cookie', init.cookies);
  return new Response(JSON.stringify(body), { status: init?.status ?? 200, headers });
}

describe('DivingFishAuthProvider.loginWithPassword', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('logs in then stores Import-Token from profile (not JWT)', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(jsonResponse({}, {
        status: 200,
        cookies: 'jwt_token=abc123; Path=/; HttpOnly',
      }))
      .mockResolvedValueOnce(jsonResponse({ import_token: 'imp-from-profile', nickname: 'n' }));
    vi.stubGlobal('fetch', request);

    const session = await new DivingFishAuthProvider().loginWithPassword({ username: 'u', password: 'p' });

    expect(session).toEqual({ mode: 'import-token', value: 'imp-from-profile', persistable: true });
    expect(request).toHaveBeenNthCalledWith(1, expect.stringContaining('/login'), expect.objectContaining({
      method: 'POST', credentials: 'include', body: JSON.stringify({ username: 'u', password: 'p' }),
    }));
    expect(request).toHaveBeenNthCalledWith(2, expect.stringContaining('/player/profile'), expect.objectContaining({
      headers: expect.objectContaining({ Cookie: 'jwt_token=abc123' }),
    }));
  });

  it('creates Import-Token when profile has none', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(jsonResponse({}, {
        status: 200,
        cookies: 'jwt_token=abc123; Path=/; HttpOnly',
      }))
      .mockResolvedValueOnce(jsonResponse({ nickname: 'n' }))
      .mockResolvedValueOnce(new Response('', { status: 200 }))
      .mockResolvedValueOnce(jsonResponse({ import_token: 'imp-created' }));
    vi.stubGlobal('fetch', request);

    const session = await new DivingFishAuthProvider().loginWithPassword({ username: 'u', password: 'p' });

    expect(session).toEqual({ mode: 'import-token', value: 'imp-created', persistable: true });
    expect(request).toHaveBeenNthCalledWith(3, expect.stringContaining('/player/import_token'), expect.objectContaining({
      method: 'PUT',
    }));
  });

  it('uses cookie jar auth when Set-Cookie jwt is unavailable to JS', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 200 }))
      .mockResolvedValueOnce(jsonResponse({ import_token: 'imp-cookie' }));
    vi.stubGlobal('fetch', request);

    const session = await new DivingFishAuthProvider().loginWithPassword({ username: 'u', password: 'p' });

    expect(session).toEqual({ mode: 'import-token', value: 'imp-cookie', persistable: true });
    expect(request).toHaveBeenNthCalledWith(2, expect.stringContaining('/player/profile'), expect.objectContaining({
      credentials: 'include',
    }));
  });

  it('throws an authentication ProviderError on 401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 401 })));

    const promise = new DivingFishAuthProvider().loginWithPassword({ username: 'u', password: 'p' });

    await expect(promise).rejects.toMatchObject({ name: 'ProviderError', code: 'authentication' });
    await expect(promise).rejects.toBeInstanceOf(ProviderError);
  });

  it('maps request failures to a network ProviderError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network failed')));

    const promise = new DivingFishAuthProvider().loginWithPassword({ username: 'u', password: 'p' });

    await expect(promise).rejects.toMatchObject({ name: 'ProviderError', code: 'network' });
  });
});
