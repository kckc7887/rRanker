import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ProviderError, providerErrorFromStatus } from '@/providers/errors';
import { requestJson, retryAfterMs } from '@/providers/http-json';

const schema = z.object({ ok: z.boolean() });

function options(overrides: Partial<Parameters<typeof requestJson<{ ok: boolean }>>[0]> = {}) {
  return {
    baseUrl: 'https://api.test',
    path: '/data',
    schema,
    label: '测试服务',
    fetcher: (async () => new Response(JSON.stringify({ ok: true }), { status: 200 })) as typeof fetch,
    error: (status: number) => new ProviderError('network', `测试服务请求失败：${status}`, status >= 500),
    ...overrides,
  } as Parameters<typeof requestJson<{ ok: boolean }>>[0];
}

function failingFetcher(status: number, headers: Record<string, string> = {}) {
  return vi.fn(async () => new Response('', { status, headers }));
}

describe('公共请求执行器的尝试次数合同', () => {
  it('总尝试次数由 totalAttempts 明确表达', async () => {
    const fetcher = failingFetcher(503);
    await expect(requestJson(options({ fetcher: fetcher as typeof fetch, totalAttempts: 4 }))).rejects.toBeInstanceOf(ProviderError);
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it('额外重试次数由 extraRetries 明确表达，总尝试次数等于重试次数加一', async () => {
    const fetcher = failingFetcher(503);
    await expect(requestJson(options({ fetcher: fetcher as typeof fetch, extraRetries: 2 }))).rejects.toBeInstanceOf(ProviderError);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('totalAttempts 与 extraRetries 同时给出时以总尝试次数为准', async () => {
    const fetcher = failingFetcher(503);
    await expect(requestJson(options({ fetcher: fetcher as typeof fetch, totalAttempts: 2, extraRetries: 5 }))).rejects.toBeInstanceOf(ProviderError);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('只读请求可以用 totalAttempts 固定为单次尝试，不做自动重试', async () => {
    const fetcher = failingFetcher(503);
    await expect(requestJson(options({ fetcher: fetcher as typeof fetch, totalAttempts: 1 }))).rejects.toBeInstanceOf(ProviderError);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('不会为已经没有后续尝试的 429 等待退避时间', async () => {
    const fetcher = failingFetcher(429, { 'Retry-After': '1' });
    const started = Date.now();
    await expect(requestJson(options({
      fetcher: fetcher as typeof fetch, totalAttempts: 1, error: (status: number) => providerErrorFromStatus(status),
    }))).rejects.toMatchObject({ code: 'rate_limit' });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(Date.now() - started).toBeLessThan(800);
  });

  it('仍有后续尝试时按 Retry-After 退避后重试', async () => {
    const fetcher = failingFetcher(429, { 'Retry-After': '0' });
    const rateLimit = (status: number) => providerErrorFromStatus(status);
    await expect(requestJson(options({
      fetcher: fetcher as typeof fetch, totalAttempts: 2, error: rateLimit,
    }))).rejects.toMatchObject({ code: 'rate_limit' });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

describe('公共请求执行器的基础错误合同', () => {
  it('预取消不发请求并透传调用方取消原因', async () => {
    const fetcher = vi.fn();
    const controller = new AbortController();
    controller.abort(new Error('已取消'));
    await expect(requestJson(options({ fetcher: fetcher as unknown as typeof fetch, signal: controller.signal })))
      .rejects.toThrow('已取消');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('超时归一化为 timeout', async () => {
    const fetcher = ((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      });
    })) as unknown as typeof fetch;
    await expect(requestJson(options({ fetcher, timeoutMs: 10, totalAttempts: 1 })))
      .rejects.toMatchObject({ code: 'timeout' });
  });

  it('无效 JSON 与结构不符都归一化为 upstream_schema', async () => {
    const invalidJson = (async () => new Response('{oops', { status: 200 })) as unknown as typeof fetch;
    await expect(requestJson(options({ fetcher: invalidJson, totalAttempts: 1 })))
      .rejects.toMatchObject({ code: 'upstream_schema' });

    const wrongShape = (async () => new Response(JSON.stringify({ ok: 'yes' }), { status: 200 })) as unknown as typeof fetch;
    await expect(requestJson(options({ fetcher: wrongShape, totalAttempts: 1 })))
      .rejects.toMatchObject({ code: 'upstream_schema' });
  });

  it('网络失败归一化为 network', async () => {
    const failing = (async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch;
    await expect(requestJson(options({ fetcher: failing, totalAttempts: 1 })))
      .rejects.toMatchObject({ code: 'network' });
  });

  it('状态码映射由调用方通过 error 回调决定', async () => {
    const fetcher = failingFetcher(401);
    await expect(requestJson(options({
      fetcher: fetcher as typeof fetch,
      totalAttempts: 1,
      error: (status: number) => providerErrorFromStatus(status, {
        authentication: '测试服务授权已失效',
        fallback: { message: (value) => `测试服务返回 HTTP ${value}` },
      }),
    }))).rejects.toMatchObject({ code: 'authentication', message: '测试服务授权已失效' });
  });
});

describe('公共请求执行器的请求头合同', () => {
  it('自定义请求头与默认头合并，公共入口可以注入 Authorization', async () => {
    const fetcher = vi.fn(async (_url: string, _init?: RequestInit) => (
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    ));
    await requestJson(options({
      fetcher: fetcher as unknown as typeof fetch,
      totalAttempts: 1,
      init: { headers: { Authorization: 'Bearer token', 'x-api-version': '20220705' } },
    }));
    expect(fetcher).toHaveBeenCalledTimes(1);
    const headers = new Headers(fetcher.mock.calls[0]![1]!.headers);
    expect(headers.get('Accept')).toBe('application/json');
    expect(headers.get('Cache-Control')).toBe('no-store');
    expect(headers.get('Authorization')).toBe('Bearer token');
    expect(headers.get('x-api-version')).toBe('20220705');
  });

  it('Retry-After 支持秒与 HTTP 日期，并受上限约束', () => {
    const seconds = new Response('', { headers: { 'Retry-After': '3' } });
    expect(retryAfterMs(seconds)).toBe(3_000);
    expect(retryAfterMs(new Response('', { headers: { 'Retry-After': '30' } }))).toBe(5_000);
    expect(retryAfterMs(new Response('', { headers: { 'Retry-After': '30' } }), 60_000)).toBe(30_000);
    expect(retryAfterMs(new Response(''))).toBe(1_000);
  });
});
