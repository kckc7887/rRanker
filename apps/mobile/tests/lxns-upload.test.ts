import { ProviderError } from '@/providers/errors';
import type { LxnsOAuthSession } from '@/providers/lxns-oauth';
import { LXNS_API_ROOT, LXNS_OAUTH_TOKEN_URL } from '@/providers/lxns-config';
import type { LxnsUploadScore } from '@/services/score-hub-sync-map';
import { uploadRecordsToLxns } from '@/services/lxns-upload';

const score: LxnsUploadScore = {
  id: 834,
  type: 'dx',
  level_index: 4,
  achievements: 101,
  fc: 'app',
  fs: 'fsdp',
  dx_score: 3000,
  dx_star: 0,
};

function session(expiresAt = Date.now() + 120_000): LxnsOAuthSession {
  return {
    mode: 'lxns-oauth',
    accessToken: 'old-access',
    refreshToken: 'old-refresh',
    expiresAt,
    persistable: true,
  };
}

describe('落雪成绩上传', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('用 Bearer OAuth 向个人成绩接口发送 scores', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(uploadRecordsToLxns({ session: session(), records: [score] }))
      .resolves.toMatchObject({ uploaded: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [[url, request]] = fetchMock.mock.calls as unknown as [[string, RequestInit]];
    expect(url).toBe(`${LXNS_API_ROOT}/user/maimai/player/scores`);
    expect(request).toMatchObject({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer old-access' }),
      body: JSON.stringify({ scores: [score] }),
    });
  });

  it('上传前刷新过期 token 并持久化轮换后的 refresh token', async () => {
    const rotated = vi.fn();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: 'new-access',
        refresh_token: 'new-refresh',
        expires_in: 3600,
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await uploadRecordsToLxns({
      session: session(Date.now() - 1),
      records: [score],
      onTokensRotated: rotated,
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(LXNS_OAUTH_TOKEN_URL);
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      headers: expect.objectContaining({ Authorization: 'Bearer new-access' }),
    });
    expect(rotated).toHaveBeenCalledWith(expect.objectContaining({
      accessToken: 'new-access', refreshToken: 'new-refresh',
    }));
    expect(result.session.refreshToken).toBe('new-refresh');
  });

  it('将权限错误标记为不可重试，并在开始前响应取消', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 403 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(uploadRecordsToLxns({ session: session(), records: [score] }))
      .rejects.toMatchObject({ code: 'permission', retryable: false } satisfies Partial<ProviderError>);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockClear();
    await expect(uploadRecordsToLxns({
      session: session(), records: [score], signal: { aborted: true },
    })).rejects.toThrow('已取消');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('在请求进行中立即响应取消信号', async () => {
    vi.useFakeTimers();
    const signal = { aborted: false };
    const fetchMock = vi.fn((_url: string, request: RequestInit) => new Promise<Response>((_resolve, reject) => {
      request.signal?.addEventListener('abort', () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      });
    }));
    vi.stubGlobal('fetch', fetchMock);
    const assertion = expect(uploadRecordsToLxns({
      session: session(), records: [score], signal,
    })).rejects.toThrow('已取消');
    signal.aborted = true;
    await vi.advanceTimersByTimeAsync(100);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('将连续请求超时报告为可重试 timeout 错误', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_url: string, request: RequestInit) => new Promise<Response>((_resolve, reject) => {
      request.signal?.addEventListener('abort', () => {
        const error = new Error('timeout');
        error.name = 'AbortError';
        reject(error);
      });
    }));
    vi.stubGlobal('fetch', fetchMock);
    const assertion = expect(uploadRecordsToLxns({ session: session(), records: [score] }))
      .rejects.toMatchObject({ code: 'timeout', retryable: true } satisfies Partial<ProviderError>);
    await vi.runAllTimersAsync();
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('对服务端错误按既有退避策略重试后返回可重试错误', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => new Response('{}', { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);
    const promise = uploadRecordsToLxns({ session: session(), records: [score] });
    const assertion = expect(promise).rejects.toMatchObject({
      code: 'network', retryable: true,
    } satisfies Partial<ProviderError>);
    await vi.runAllTimersAsync();
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
