import { DivingFishAuthProvider } from '@/providers/diving-fish-auth';
import { ProviderError } from '@/providers/errors';

class MockXHR {
  static instance: MockXHR | null = null;
  withCredentials = false;
  status = 0;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  open = vi.fn();
  setRequestHeader = vi.fn();
  send = vi.fn();
  getResponseHeader: (name: string) => string | null = vi.fn(() => null);
  getAllResponseHeaders: () => string = vi.fn(() => '');

  constructor() { MockXHR.instance = this; }
}

describe('DivingFishAuthProvider.loginWithPassword', () => {
  beforeEach(() => {
    MockXHR.instance = null;
    vi.stubGlobal('XMLHttpRequest', MockXHR);
  });

  it('extracts jwt_token from the Set-Cookie response header', async () => {
    const provider = new DivingFishAuthProvider();
    const promise = provider.loginWithPassword({ username: 'u', password: 'p' });
    const xhr = MockXHR.instance!;
    xhr.status = 200;
    xhr.getResponseHeader = () => 'jwt_token=abc123; Path=/; HttpOnly';
    xhr.onload!();
    const session = await promise;
    expect(session).toEqual({ mode: 'jwt', value: 'abc123', persistable: true });
    expect(xhr.open).toHaveBeenCalledWith('POST', expect.stringContaining('/login'));
    expect(xhr.withCredentials).toBe(true);
    expect(xhr.setRequestHeader).toHaveBeenCalledWith('Content-Type', 'application/json');
  });

  it('falls back to getAllResponseHeaders when Set-Cookie header is null', async () => {
    const provider = new DivingFishAuthProvider();
    const promise = provider.loginWithPassword({ username: 'u', password: 'p' });
    const xhr = MockXHR.instance!;
    xhr.status = 200;
    xhr.getResponseHeader = () => null;
    xhr.getAllResponseHeaders = () =>
      'content-type: application/json\r\nset-cookie: jwt_token=def456; Path=/\r\n';
    xhr.onload!();
    const session = await promise;
    expect(session).toEqual({ mode: 'jwt', value: 'def456', persistable: true });
  });

  it('throws authentication error when no jwt_token can be extracted', async () => {
    const provider = new DivingFishAuthProvider();
    const promise = provider.loginWithPassword({ username: 'u', password: 'p' });
    const xhr = MockXHR.instance!;
    xhr.status = 200;
    xhr.getResponseHeader = () => null;
    xhr.getAllResponseHeaders = () => 'content-type: application/json\r\n';
    xhr.onload!();
    await expect(promise).rejects.toMatchObject({ name: 'ProviderError', code: 'authentication' });
    await expect(promise).rejects.toBeInstanceOf(ProviderError);
  });

  it('throws an authentication ProviderError on 401', async () => {
    const provider = new DivingFishAuthProvider();
    const promise = provider.loginWithPassword({ username: 'u', password: 'p' });
    const xhr = MockXHR.instance!;
    xhr.status = 401;
    xhr.onload!();
    await expect(promise).rejects.toMatchObject({ name: 'ProviderError', code: 'authentication' });
    await expect(promise).rejects.toBeInstanceOf(ProviderError);
  });
});
