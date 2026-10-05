import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as SecureStore from 'expo-secure-store';
import {
  beginOsuAuthorize,
  buildAuthorizeUrl,
  clearOsuRotationCache,
  exchangeOsuAuthorizationCode,
  osuRotationAncestors,
  rotateOsuTokens,
} from '@/providers/osu-oauth';
import { ProviderError } from '@/providers/errors';

process.env.OSU_OAUTH_CLIENT_SECRET ??= 'test-client-secret';

const values = vi.hoisted(() => new Map<string, string>());
vi.mock('expo-secure-store', () => ({
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
    getItemAsync: vi.fn(async (key: string) => values.get(key) ?? null),
    setItemAsync: vi.fn(async (key: string, value: string) => { values.set(key, value); }),
    deleteItemAsync: vi.fn(async (key: string) => { values.delete(key); }),
}));
beforeEach(() => { values.clear(); vi.clearAllMocks(); });

function stubTokenFetch(body: unknown, status = 200) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status })));
}

afterEach(() => {
  vi.unstubAllGlobals();
  clearOsuRotationCache();
});

describe('osu! 待授权数据', () => {
  const key = 'rranker.osu.oauth.pending.v1';
  const pending = { state: 'state-1', expiresAt: Date.now() + 600_000 };

  it('合法数据在错误回调后仍可使用', async () => {
    const raw = JSON.stringify(pending);
    values.set(key, raw);
    values.set('other-account', 'keep');
    await expect(exchangeOsuAuthorizationCode('code', 'different-state')).rejects.toMatchObject({ code: 'authorization_callback' });
    expect([...values]).toEqual([[key, raw], ['other-account', 'keep']]);
  });

  it.each([JSON.stringify({ state: 'state-1' }), '{', 'null', ''])
    ('旧结构或损坏正文只删除当前键：%s', async raw => {
      values.set(key, raw);
      values.set('other-account', 'keep');
      await expect(exchangeOsuAuthorizationCode('code', pending.state)).rejects.toMatchObject({ code: 'authorization_callback' });
      expect([...values]).toEqual([['other-account', 'keep']]);
    });

  it.each(['read', 'delete'] as const)('%s I/O 失败报错并保留数据', async operation => {
    const raw = operation === 'read' ? JSON.stringify(pending) : '{';
    values.set(key, raw);
    values.set('other-account', 'keep');
    const failure = new Error(`${operation} failed`);
    vi.mocked(operation === 'read' ? SecureStore.getItemAsync : SecureStore.deleteItemAsync).mockRejectedValueOnce(failure);
    await expect(exchangeOsuAuthorizationCode('code', pending.state)).rejects.toMatchObject({ code: 'credential_storage', cause: failure });
    expect([...values]).toEqual([[key, raw], ['other-account', 'keep']]);
  });
});

describe('osu! OAuth 授权与轮换', () => {
  it('buildAuthorizeUrl 使用授权码参数与注册回调', () => {
    const url = buildAuthorizeUrl('state-1');
    expect(url.startsWith('https://osu.ppy.sh/oauth/authorize?')).toBe(true);
    const query = new URLSearchParams(url.split('?')[1]);
    expect(query.get('response_type')).toBe('code');
    expect(query.get('client_id')).toBe('65933');
    expect(query.get('redirect_uri')).toBe('rranker://oauth/osu');
    expect(query.get('scope')).toBe('identify public');
    expect(query.get('state')).toBe('state-1');
    expect(query.has('code_challenge')).toBe(false);
  });

  it('beginOsuAuthorize 持久化 state 并返回授权地址', async () => {
    const url = await beginOsuAuthorize();
    expect(url).toContain('state=');
  });

  it('exchangeOsuAuthorizationCode 成功换取会话（携带 client_secret）', async () => {
    const authorizeUrl = await beginOsuAuthorize();
    const state = new URLSearchParams(authorizeUrl.split('?')[1]).get('state');
    const fetchMock = vi.fn(async (_url: unknown, _init: { body?: unknown }) => new Response(JSON.stringify({
        access_token: 'access-1',
        expires_in: 86400,
        refresh_token: 'refresh-1',
        token_type: 'Bearer',
    })));
    vi.stubGlobal('fetch', fetchMock);
    if (!state) throw new Error('authorize url is missing state');
    const session = await exchangeOsuAuthorizationCode('code-1', state);
    expect(session.mode).toBe('osu-oauth');
    expect(session.accessToken).toBe('access-1');
    expect(session.refreshToken).toBe('refresh-1');
    expect(session.expiresAt).toBeGreaterThan(Date.now());
    const body = new URLSearchParams(String(fetchMock.mock.calls[0]?.[1]?.body ?? ''));
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code')).toBe('code-1');
    expect(body.get('client_secret')).toBeTruthy();
    expect(body.get('redirect_uri')).toBe('rranker://oauth/osu');
  });

  it('exchangeOsuAuthorizationCode 在请求令牌前拒绝缺省、空、错误、过期和重复的 state', async () => {
    const fetchMock = vi.fn(async () => new Response('{"access_token":"a","expires_in":86400,"refresh_token":"r"}'));
    vi.stubGlobal('fetch', fetchMock);
    const authorizeUrl = await beginOsuAuthorize();
    const state = new URLSearchParams(authorizeUrl.split('?')[1]).get('state') ?? '';
    await expect(exchangeOsuAuthorizationCode('code-1', '')).rejects.toMatchObject({ code: 'authorization_callback' });
    await expect(exchangeOsuAuthorizationCode('code-1', 'other-state')).rejects.toMatchObject({ code: 'authorization_callback' });
    expect(fetchMock).not.toHaveBeenCalled();
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 11 * 60 * 1000);
    await expect(exchangeOsuAuthorizationCode('code-1', state)).rejects.toMatchObject({ code: 'authorization_callback' });
    expect(fetchMock).not.toHaveBeenCalled();
    vi.mocked(Date.now).mockRestore();
  });

  it('exchangeOsuAuthorizationCode 成功后不能再次使用同一 state', async () => {
    const authorizeUrl = await beginOsuAuthorize();
    const state = new URLSearchParams(authorizeUrl.split('?')[1]).get('state') ?? '';
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
        access_token: 'access-1', expires_in: 86400, refresh_token: 'refresh-1',
    })));
    vi.stubGlobal('fetch', fetchMock);
    await exchangeOsuAuthorizationCode('code-1', state);
    await expect(exchangeOsuAuthorizationCode('code-1', state)).rejects.toMatchObject({ code: 'authorization_callback' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('并发回调仅消费一次pending并发出一次凭据POST', async () => {
    const state = new URLSearchParams((await beginOsuAuthorize()).split('?')[1]).get('state') ?? '';
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ access_token: 'a', expires_in: 86400, refresh_token: 'r' })));
    vi.stubGlobal('fetch', fetchMock);
    const results = await Promise.allSettled([exchangeOsuAuthorizationCode('code', state), exchangeOsuAuthorizationCode('code', state)]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'POST', credentials: 'omit', redirect: 'error' });
  });

  it('失败的换码POST不会被自动重试', async () => {
    const state = new URLSearchParams((await beginOsuAuthorize()).split('?')[1]).get('state') ?? '';
    const fetchMock = vi.fn(async () => new Response('{"error":"server_error"}', { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(exchangeOsuAuthorizationCode('code', state)).rejects.toMatchObject({ code: 'network' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('exchangeOsuAuthorizationCode 在构建缺失凭据时明确报错且不请求网络', async () => {
    const authorizeUrl = await beginOsuAuthorize();
    const state = new URLSearchParams(authorizeUrl.split('?')[1]).get('state') ?? '';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const previous = process.env.OSU_OAUTH_CLIENT_SECRET;
    delete process.env.OSU_OAUTH_CLIENT_SECRET;
    try {
      await expect(exchangeOsuAuthorizationCode('code-1', state)).rejects.toMatchObject({
        code: 'configuration',
        message: expect.stringContaining('凭据缺失') as string,
      });
    } finally {
      if (previous !== undefined) process.env.OSU_OAUTH_CLIENT_SECRET = previous;
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('exchangeOsuAuthorizationCode 401 报鉴权错误', async () => {    const authorizeUrl = await beginOsuAuthorize();
    const state = new URLSearchParams(authorizeUrl.split('?')[1]).get('state') ?? '';
    stubTokenFetch({ error: 'invalid_grant', error_description: '授权码无效' }, 401);
    await expect(exchangeOsuAuthorizationCode('code-1', state)).rejects.toMatchObject({
      code: 'authentication',
    } as Partial<ProviderError>);
  });

  it('rotateOsuTokens 并发轮换共享一次请求（refresh_token 单次使用）', async () => {
    let resolveFirst: ((value: unknown) => void) | null = null;
    const first = new Promise((resolve) => { resolveFirst = resolve; });
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      calls += 1;
      const payload = await (calls === 1 ? first : Promise.resolve({
        access_token: 'access-2', expires_in: 86400, refresh_token: 'refresh-2',
      }));
      return new Response(JSON.stringify(payload));
    }));
    const rotating = Promise.all([
      rotateOsuTokens('refresh-1'),
      rotateOsuTokens('refresh-1'),
    ]);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(calls).toBe(1);
    resolveFirst!({ access_token: 'access-2', expires_in: 86400, refresh_token: 'refresh-2' });
    const [left, right] = await rotating;
    expect(calls).toBe(1);
    expect(left.refreshToken).toBe('refresh-2');
    expect(right).toBe(left);
  });

  it('rotateOsuTokens 把旧刷新令牌解析到最新一代', async () => {
    const payloads = [
      { access_token: 'access-b', expires_in: 86400, refresh_token: 'refresh-b' },
      { access_token: 'access-c', expires_in: 86400, refresh_token: 'refresh-c' },
    ];
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(payloads.shift()))));
    const second = await rotateOsuTokens('refresh-a');
    const third = await rotateOsuTokens(second.refreshToken);
    await expect(rotateOsuTokens('refresh-a')).resolves.toMatchObject({ refreshToken: third.refreshToken });
    await expect(rotateOsuTokens('refresh-b')).resolves.toMatchObject({ refreshToken: 'refresh-c' });
  });

  it('并发刷新期间保留进行中的令牌，清空后旧会话不能覆盖新登录', async () => {
    let resolveFirst: ((value: unknown) => void) | null = null;
    const first = new Promise((resolve) => { resolveFirst = resolve; });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(await first))));
    const pending = rotateOsuTokens('refresh-live');
    await new Promise((resolve) => setTimeout(resolve, 10));

    resolveFirst!({ access_token: 'access-live', expires_in: 86400, refresh_token: 'refresh-next' });
    await pending;
    expect(osuRotationAncestors('refresh-next')).toContain('refresh-live');
    clearOsuRotationCache();

    expect(osuRotationAncestors('refresh-next')).not.toContain('refresh-live');
  });
});
