import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  beginOsuAuthorize,
  buildAuthorizeUrl,
  exchangeOsuAuthorizationCode,
  rotateOsuTokens,
} from '@/providers/osu-oauth';
import { ProviderError } from '@/providers/errors';

vi.mock('expo-secure-store', () => {
  let pending: string | null = JSON.stringify({ state: 'state-1' });
  return {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
    getItemAsync: vi.fn(async () => pending),
    setItemAsync: vi.fn(async (_key: string, value: string) => { pending = value; }),
    deleteItemAsync: vi.fn(async () => { pending = null; }),
  };
});

function stubTokenFetch(body: unknown, status = 200) {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  })));
}

afterEach(() => {
  vi.unstubAllGlobals();
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
    const fetchMock = vi.fn(async (_url: unknown, init: { body?: unknown }) => ({
      ok: true,
      status: 200,
      json: async () => ({
        access_token: 'access-1',
        expires_in: 86400,
        refresh_token: 'refresh-1',
        token_type: 'Bearer',
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    const session = await exchangeOsuAuthorizationCode('code-1', state ?? undefined);
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

  it('exchangeOsuAuthorizationCode 校验 state 失败报鉴权错误', async () => {
    stubTokenFetch({ access_token: 'a', expires_in: 86400, refresh_token: 'r' });
    await expect(exchangeOsuAuthorizationCode('code-1', 'other-state')).rejects.toMatchObject({
      code: 'authentication',
    } as Partial<ProviderError>);
  });

  it('exchangeOsuAuthorizationCode 401 报鉴权错误', async () => {
    stubTokenFetch({ error: 'invalid_grant', error_description: '授权码无效' }, 401);
    await expect(exchangeOsuAuthorizationCode('code-1', 'state-1')).rejects.toMatchObject({
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
      return {
        ok: true,
        status: 200,
        json: async () => payload,
      };
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
});
