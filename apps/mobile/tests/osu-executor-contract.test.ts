import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OsuScoreProvider } from '@/providers/osu-score-provider';

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('expo/fetch', () => ({ fetch: mocks.fetch }));

const session = {
  mode: 'osu-oauth',
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
  expiresAt: Date.now() + 3_600_000,
  persistable: true,
} as const;

function requestInit(index = 0) {
  const call = mocks.fetch.mock.calls[index]!;
  return { url: String(call[0]), init: call[1] as RequestInit, headers: new Headers((call[1] as RequestInit).headers) };
}

describe('OsuScoreProvider 走公共请求执行器', () => {
  beforeEach(() => {
    mocks.fetch.mockReset();
  });

  it('每个请求都注入 Bearer 与 x-api-version，并带上公共执行器的默认头', async () => {
    mocks.fetch.mockResolvedValue(new Response('', { status: 401 }));
    await expect(new OsuScoreProvider(session).getOwnUser('osu-standard')).rejects.toMatchObject({ code: 'authentication' });

    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    const sent = requestInit();
    expect(sent.url).toContain('/me/osu');
    expect(sent.headers.get('Authorization')).toBe('Bearer access-token');
    expect(sent.headers.get('x-api-version')).toBe('20220705');
    expect(sent.headers.get('Accept')).toBe('application/json');
    expect(sent.headers.get('Cache-Control')).toBe('no-store');
  });

  it('状态码映射保留 osu! 文案与路径后缀', async () => {
    mocks.fetch.mockResolvedValue(new Response('', { status: 404 }));
    await expect(new OsuScoreProvider(session).getBeatmapset(1))
      .rejects.toMatchObject({ code: 'no_data', message: expect.stringContaining('（/beatmapsets/1）') });
  });

  it('只读端点固定单次尝试：429 不做退避也不重发', async () => {
    mocks.fetch.mockResolvedValue(new Response('', { status: 429, headers: { 'Retry-After': '5' } }));
    const started = Date.now();
    await expect(new OsuScoreProvider(session).getOwnUser('osu-standard')).rejects.toMatchObject({ code: 'rate_limit' });
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it('无效 JSON 与网络失败归一化文案保持 osu! 语义', async () => {
    mocks.fetch.mockResolvedValue(new Response('{oops', { status: 200 }));
    await expect(new OsuScoreProvider(session).getOwnUser('osu-standard'))
      .rejects.toMatchObject({ code: 'upstream_schema', message: 'osu! 数据结构与已验证契约不一致' });

    mocks.fetch.mockReset();
    mocks.fetch.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(new OsuScoreProvider(session).getOwnUser('osu-standard'))
      .rejects.toMatchObject({ code: 'network', message: '无法连接 osu! 服务' });
  });

  it('超时归一化文案保持 osu! 语义', async () => {
    vi.useFakeTimers();
    try {
      mocks.fetch.mockImplementation((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        });
      }));
      const pending = new OsuScoreProvider(session).getOwnUser('osu-standard');
      const assertion = expect(pending).rejects.toMatchObject({ code: 'timeout', message: 'osu! 数据读取超时' });
      await vi.advanceTimersByTimeAsync(12_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it('请求前取消不发出请求并透传调用方原因', async () => {
    const controller = new AbortController();
    controller.abort(new Error('已取消'));
    await expect(new OsuScoreProvider(session).getOwnUser('osu-standard', controller.signal)).rejects.toThrow('已取消');
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
