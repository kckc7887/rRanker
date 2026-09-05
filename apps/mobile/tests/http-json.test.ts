import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { requestJson, fetchProviderJson } from '@/providers/http-json';
import { providerErrorFromStatus } from '@/providers/errors';

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));
vi.mock('expo/fetch', () => ({ fetch: fetchMock }));
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

function rejectOnAbort(_url: unknown, init?: RequestInit): Promise<Response> {
  return new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new Error('fetch failed: cancelled')));
  });
}

describe('Expo fetch cancellation compatibility', () => {
  it.each(['json', 'provider'] as const)('classifies wrapped abort failures as timeout through %s', async (kind) => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(rejectOnAbort);
    const request = kind === 'json' ? requestJson({
      path: '/data', baseUrl: 'https://example.test', schema: z.unknown(),
      fetcher: fetchMock, label: '测试', error: providerErrorFromStatus,
    }) : fetchProviderJson({
      baseUrl: 'https://example.test', path: '/data', invalidJsonMessage: '无效数据',
      timeoutMessage: '超时', networkMessage: '连接失败',
    });
    const result = request.catch((error: unknown) => error);
    await vi.runAllTimersAsync();
    expect(await result).toMatchObject({ code: 'timeout' });
  });

  it('preserves external cancellation without retrying or reporting a timeout', async () => {
    const controller = new AbortController();
    fetchMock.mockImplementation(rejectOnAbort);
    const result = requestJson({
      path: '/data', baseUrl: 'https://example.test', schema: z.unknown(),
      fetcher: fetchMock, label: '测试', error: providerErrorFromStatus, signal: controller.signal,
    }).catch((error: unknown) => error);
    controller.abort();
    expect(await result).toEqual(new Error('fetch failed: cancelled'));
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
