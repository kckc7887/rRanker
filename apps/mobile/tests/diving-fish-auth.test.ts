import { DivingFishAuthProvider } from '@/providers/diving-fish-auth';
import { ProviderError } from '@/providers/errors';

describe('DivingFishAuthProvider.loginWithPassword', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('extracts and persists jwt_token when Expo exposes Set-Cookie', async () => {
    const request = vi.fn().mockResolvedValue(new Response('', {
      status: 200,
      headers: { 'Set-Cookie': 'jwt_token=abc123; Path=/; HttpOnly' },
    }));
    vi.stubGlobal('fetch', request);

    const session = await new DivingFishAuthProvider().loginWithPassword({ username: 'u', password: 'p' });

    expect(session).toEqual({ mode: 'jwt', value: 'abc123', persistable: true });
    expect(request).toHaveBeenCalledWith(expect.stringContaining('/login'), expect.objectContaining({
      method: 'POST', credentials: 'include', body: JSON.stringify({ username: 'u', password: 'p' }),
    }));
  });

  it('extracts jwt_token from Expo native raw headers when standard Headers hides it', async () => {
    const response = new Response('', { status: 200 });
    Object.defineProperty(response, '_rawHeaders', {
      value: [['Content-Type', 'application/json'], ['Set-Cookie', 'jwt_token=raw456; Path=/; HttpOnly']],
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));

    const session = await new DivingFishAuthProvider().loginWithPassword({ username: 'u', password: 'p' });

    expect(session).toEqual({ mode: 'jwt', value: 'raw456', persistable: true });
  });

  it('uses the native cookie jar when HttpOnly Set-Cookie is not exposed to JS', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 200 })));

    const session = await new DivingFishAuthProvider().loginWithPassword({ username: 'u', password: 'p' });

    expect(session).toEqual({ mode: 'cookie-jar', persistable: false });
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
