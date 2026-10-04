import { mapLxnsScore } from '@/domain/schemas';
import {
  buildAuthorizeUrl,
  createPkcePair,
  lxnsAccessTokenExpired,
  type PendingLxnsOAuth,
} from '@/providers/lxns-oauth';
import { LXNS_OAUTH_CLIENT_ID, LXNS_OAUTH_REDIRECT_URI } from '@/providers/lxns-config';

vi.mock('expo-crypto', () => ({
  getRandomBytesAsync: async (count: number) => new Uint8Array(count).map((_, index) => index + 1),
  digestStringAsync: async () => 'abcd+/ef==',
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  CryptoEncoding: { BASE64: 'base64', HEX: 'hex' },
}));

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => undefined),
  deleteItemAsync: vi.fn(async () => undefined),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
}));

describe('lxns oauth helpers', () => {
  it('builds authorize url with PKCE, scheme redirect and state', async () => {
    const { challenge } = await createPkcePair();
    const url = buildAuthorizeUrl(challenge, 'state-token');
    expect(url).toContain(`client_id=${LXNS_OAUTH_CLIENT_ID}`);
    expect(url).toContain(`redirect_uri=${encodeURIComponent(LXNS_OAUTH_REDIRECT_URI)}`);
    expect(LXNS_OAUTH_REDIRECT_URI).toBe('rranker://oauth/lxns');
    expect(url).toContain('state=state-token');
    expect(url).toContain('code_challenge_method=S256');
    expect(url).toContain(`code_challenge=${encodeURIComponent(challenge)}`);
    expect(challenge).toBe('abcd-_ef');
  });

  it('detects near-expiry access tokens', () => {
    expect(lxnsAccessTokenExpired({
      mode: 'lxns-oauth',
      accessToken: 'a',
      refreshToken: 'r',
      expiresAt: Date.now() + 10_000,
      persistable: true,
    })).toBe(true);
    expect(lxnsAccessTokenExpired({
      mode: 'lxns-oauth',
      accessToken: 'a',
      refreshToken: 'r',
      expiresAt: Date.now() + 120_000,
      persistable: true,
    })).toBe(false);
  });
});

type FetchMock = ReturnType<typeof vi.fn>;

function tokenResponse(payload: Record<string, unknown>): FetchMock {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => payload,
  }));
}

async function loadLxnsOAuthModule(options: {
  fetchImpl?: FetchMock;
  pending?: PendingLxnsOAuth | null;
} = {}) {
  vi.resetModules();
  let pending = options.pending ?? null;
  if (options.fetchImpl) vi.doMock('expo/fetch', () => ({ fetch: options.fetchImpl }));
  vi.doMock('expo-secure-store', () => ({
    getItemAsync: vi.fn(async (key: string) => (
      key === 'rranker.lxns.oauth.pending.v2' && pending
        ? JSON.stringify(pending)
        : null
    )),
    setItemAsync: vi.fn(async (key: string, value: string) => {
      if (key === 'rranker.lxns.oauth.pending.v2') pending = JSON.parse(value);
    }),
    deleteItemAsync: vi.fn(async (key: string) => {
      if (key === 'rranker.lxns.oauth.pending.v2') pending = null;
    }),
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
  }));
  return import('@/providers/lxns-oauth');
}

describe('rotateLxnsTokens', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('deduplicates concurrent refreshes for the same refresh token', async () => {
    const fetchMock = tokenResponse({
      access_token: 'a1',
      token_type: 'Bearer',
      expires_in: 900,
      refresh_token: 'r2',
    });
    const { rotateLxnsTokens } = await loadLxnsOAuthModule({ fetchImpl: fetchMock });
    const [first, second] = await Promise.all([
      rotateLxnsTokens('r1'),
      rotateLxnsTokens('r1'),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
    expect(first.refreshToken).toBe('r2');
    expect(first.accessToken).toBe('a1');
  });

  it('reuses the cached rotation for a stale refresh token without network', async () => {
    const fetchMock = tokenResponse({
      access_token: 'a1',
      token_type: 'Bearer',
      expires_in: 900,
      refresh_token: 'r2',
    });
    const { rotateLxnsTokens } = await loadLxnsOAuthModule({ fetchImpl: fetchMock });
    const first = await rotateLxnsTokens('r1');
    const second = await rotateLxnsTokens('r1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  it('resolves an old refresh token through every expired rotation', async () => {
    let now = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const responses = [
      {
        access_token: 'a2', token_type: 'Bearer', expires_in: 900, refresh_token: 'r2',
      },
      {
        access_token: 'a3', token_type: 'Bearer', expires_in: 900, refresh_token: 'r3',
      },
    ];
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => responses.shift(),
    }));
    const { rotateLxnsTokens } = await loadLxnsOAuthModule({ fetchImpl: fetchMock });

    await rotateLxnsTokens('r1');
    now += 901_000;
    const latest = await rotateLxnsTokens('r2');
    const recovered = await rotateLxnsTokens('r1');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(latest.refreshToken).toBe('r3');
    expect(recovered).toEqual(latest);
  });

  it('deduplicates the next refresh for callers holding different token generations', async () => {
    let now = 2_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const responses = [
      {
        access_token: 'a2', token_type: 'Bearer', expires_in: 900, refresh_token: 'r2',
      },
      {
        access_token: 'a3', token_type: 'Bearer', expires_in: 900, refresh_token: 'r3',
      },
    ];
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => responses.shift(),
    }));
    const { rotateLxnsTokens } = await loadLxnsOAuthModule({ fetchImpl: fetchMock });

    await rotateLxnsTokens('r1');
    now += 901_000;
    const [fromCurrent, fromOld] = await Promise.all([
      rotateLxnsTokens('r2'),
      rotateLxnsTokens('r1'),
    ]);
    const recoveredAgain = await rotateLxnsTokens('r1');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fromOld).toEqual(fromCurrent);
    expect(fromOld.refreshToken).toBe('r3');
    expect(recoveredAgain).toEqual(fromCurrent);
  });

  it('propagates a later authentication failure without returning an expired intermediate session', async () => {
    let now = 3_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          access_token: 'a2', token_type: 'Bearer', expires_in: 900, refresh_token: 'r2',
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: 'invalid_grant' }),
      });
    const { rotateLxnsTokens } = await loadLxnsOAuthModule({ fetchImpl: fetchMock });

    await rotateLxnsTokens('r1');
    now += 901_000;

    await expect(rotateLxnsTokens('r1')).rejects.toMatchObject({ code: 'authentication' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('remembers the consumed generations so a late commit can be attributed', async () => {
    const fetchMock = tokenResponse({
      access_token: 'a1',
      token_type: 'Bearer',
      expires_in: 900,
      refresh_token: 'r2',
    });
    const { lxnsRotationAncestors, rotateLxnsTokens } =
      await loadLxnsOAuthModule({ fetchImpl: fetchMock });

    await rotateLxnsTokens('r1');

    expect(lxnsRotationAncestors('r2')).toContain('r1');
    expect(lxnsRotationAncestors('r2')).toEqual(['r1']);
    expect(lxnsRotationAncestors('r2')).not.toContain('r-fresh');
  });
});

describe('exchangeLxnsAuthorizationCode state check', () => {
  const pending: PendingLxnsOAuth = {
    verifier: 'verifier',
    state: 'expected-state',
    gameId: 'maimai',
    expiresAt: Date.now() + 600_000,
  };

  it('rejects a mismatched state before any network request', async () => {
    const fetchMock = tokenResponse({
      access_token: 'a1',
      token_type: 'Bearer',
      expires_in: 900,
      refresh_token: 'r2',
    });
    const { exchangeLxnsAuthorizationCode } = await loadLxnsOAuthModule({
      fetchImpl: fetchMock,
      pending,
    });
    await expect(
      exchangeLxnsAuthorizationCode('auth-code', 'wrong-state'),
    ).rejects.toMatchObject({ code: 'authorization_callback' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('exchanges with matching state and clears pending verifier', async () => {
    const fetchMock = tokenResponse({
      access_token: 'a1',
      token_type: 'Bearer',
      expires_in: 900,
      refresh_token: 'r2',
    });
    const { exchangeLxnsAuthorizationCode } = await loadLxnsOAuthModule({
      fetchImpl: fetchMock,
      pending,
    });
    const session = await exchangeLxnsAuthorizationCode('auth-code', 'expected-state');
    expect(session.accessToken).toBe('a1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await expect(exchangeLxnsAuthorizationCode('auth-code', 'expected-state')).rejects.toMatchObject({ code: 'authorization_callback' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, '', ' ', ['expected-state'], ['expected-state', 'other']])('requires one nonempty state: %j', async state => {
    const fetchMock = tokenResponse({});
    const { exchangeLxnsAuthorizationCode } = await loadLxnsOAuthModule({ fetchImpl: fetchMock, pending });
    await expect(exchangeLxnsAuthorizationCode('auth-code', state)).rejects.toMatchObject({ code: 'authorization_callback' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an expired verifier without sending the code', async () => {
    const fetchMock = tokenResponse({});
    const { exchangeLxnsAuthorizationCode } = await loadLxnsOAuthModule({ fetchImpl: fetchMock, pending: { ...pending, expiresAt: Date.now() - 1 } });
    await expect(exchangeLxnsAuthorizationCode('auth-code', pending.state)).rejects.toMatchObject({ code: 'authorization_callback' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('atomically consumes the verifier before concurrent callbacks can reuse it', async () => {
    const fetchMock = tokenResponse({ access_token: 'a1', token_type: 'Bearer', expires_in: 900, refresh_token: 'r2' });
    const { exchangeLxnsAuthorizationCode } = await loadLxnsOAuthModule({ fetchImpl: fetchMock, pending });
    const results = await Promise.allSettled([exchangeLxnsAuthorizationCode('code', pending.state), exchangeLxnsAuthorizationCode('code', pending.state)]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'POST', credentials: 'omit', redirect: 'error' });
  });

  it('a failed token POST is not retried and the consumed verifier cannot be reused', async () => {
    const fetchMock = vi.fn(async () => new Response('{"error":"temporary_failure"}', { status: 503 }));
    const { exchangeLxnsAuthorizationCode } = await loadLxnsOAuthModule({ fetchImpl: fetchMock, pending });
    await expect(exchangeLxnsAuthorizationCode('code', pending.state)).rejects.toMatchObject({ code: 'network' });
    await expect(exchangeLxnsAuthorizationCode('code', pending.state)).rejects.toMatchObject({ code: 'authorization_callback' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('an old completed POST never clears a newer authorization', async () => {
    let complete!: (response: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>(resolve => { complete = resolve; }));
    const oauth = await loadLxnsOAuthModule({ fetchImpl: fetchMock, pending });
    const old = oauth.exchangeLxnsAuthorizationCode('code', pending.state);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await oauth.beginLxnsAuthorize({ gameId: 'chunithm' });
    complete(new Response(JSON.stringify({ access_token: 'a', refresh_token: 'r', expires_in: 900 })));
    await old;
    expect(await oauth.readPendingLxnsOAuth()).toMatchObject({ gameId: 'chunithm' });
  });

  it('pre-cancelled authorization never consumes the pending verifier or calls the transport', async () => {
    const fetchMock = tokenResponse({});
    const oauth = await loadLxnsOAuthModule({ fetchImpl: fetchMock, pending });
    const controller = new AbortController(); const reason = new Error('用户已离开'); controller.abort(reason);
    await expect(oauth.exchangeLxnsAuthorizationCode('code', pending.state, controller.signal)).rejects.toBe(reason);
    expect(await oauth.readPendingLxnsOAuth()).toEqual(pending);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('mapLxnsScore', () => {
  it('maps standard/dx types and floors dx_rating', () => {
    const sd = mapLxnsScore({
      id: 834,
      song_name: 'Test',
      level: '14+',
      level_index: 3,
      achievements: 100.5,
      fc: 'app',
      fs: null,
      dx_score: 2500,
      dx_rating: 308.9,
      rate: 'sssp',
      type: 'standard',
    });
    expect(sd.type).toBe('SD');
    expect(sd.rating).toBe(308);
    expect(sd.difficulty).toBe('master');
    expect(sd.fc).toBe('app');
    expect(sd.dxScore).toBe(2500);

    const dx = mapLxnsScore({
      id: 834,
      level_index: 4,
      achievements: 99,
      type: 'dx',
      dx_score: null,
      dx_rating: 12.1,
    });
    expect(dx.type).toBe('DX');
    expect(dx.rating).toBe(12);
    expect(dx.title).toBe('曲名缺失');
    expect(dx.incomplete).toBe(true);
    expect(mapLxnsScore({
      id: 100123,
      level_index: 0,
      achievements: 99,
      type: 'utage',
      dx_score: null,
    })).toMatchObject({
      songId: '100123',
      type: 'UTAGE',
      difficulty: 'utage',
      rating: 0,
    });
  });
});
