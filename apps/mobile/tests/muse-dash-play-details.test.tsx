import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { MUSE_DASH_MISS_DETAIL_FAILED, museDashMissDetail } from '@/domain/muse-dash';
import { useMuseDashPlayDetails } from '@/hooks/use-muse-dash';

type PlayDetailPayload = { play: { acc?: number; miss?: number } };

const mockLoadPlayDetail = jest.fn(async (
  ..._args: [string, number, string, string, AbortSignal?]
): Promise<PlayDetailPayload> => {
  if (_args[0] === '0-47') throw new Error('detail request failed');
  return { play: { acc: 100 } };
});

jest.mock('@/components/CachedTabScreen', () => ({ useCachedTabActive: () => true }));
jest.mock('@/services/muse-dash-cache', () => ({
  loadMuseDashPlayDetailFresh: (uid: string, difficulty: number, platform: string, userId: string, signal?: AbortSignal) =>
    mockLoadPlayDetail(uid, difficulty, platform, userId, signal),
  makeMuseDashSnapshot: (data: unknown) => ({
    data,
    source: { kind: 'musedash', label: 'MuseDash.moe', updatedAt: '2026-08-10T00:00:00.000Z', isStale: false },
  }),
  loadMuseDashAlbumsFresh: jest.fn(),
  loadMuseDashAlbumsFreshSnapshot: jest.fn(),
  loadMuseDashCeFresh: jest.fn(),
  loadMuseDashDiffdiffFresh: jest.fn(),
  loadMuseDashDiffdiffFreshSnapshot: jest.fn(),
  loadMuseDashPlayerFresh: jest.fn(),
  MuseDashCache: class MuseDashCache {},
}));

const items = [
  { uid: '0-47', difficulty: 4, platform: 'mobile' },
  { uid: '0-48', difficulty: 0, platform: 'mobile' },
];

function createWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe('useMuseDashPlayDetails', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mockLoadPlayDetail.mockImplementation(async (uid: string) => {
      if (uid === '0-47') throw new Error('detail request failed');
      return { play: { acc: 100 } };
    });
  });

  afterEach(async () => {
    cleanup();
    // 取消请求后 react-query 会在微任务里重新安排明细缓存的回收定时器，等它落地再清理。
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    queryClient.clear();
  });

  it('最终失败与「已取到但没有 miss 字段」是两种状态', async () => {
    const { result } = await renderHook(() => useMuseDashPlayDetails(items, 'user-1', true), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.failedCount).toBe(1));
    expect(result.current.missByChart.get('0-47:4')).toBe(MUSE_DASH_MISS_DETAIL_FAILED);
    expect(museDashMissDetail(result.current.missByChart.get('0-47:4'))).toEqual({ status: 'failed' });
    expect(museDashMissDetail(result.current.missByChart.get('0-48:0'))).toEqual({ status: 'unknown' });
    expect(mockLoadPlayDetail).toHaveBeenCalledTimes(2);
  });

  it('重试只重新请求失败项，成功后回到已确认的 miss', async () => {
    const { result } = await renderHook(() => useMuseDashPlayDetails(items, 'user-1', true), {
      wrapper: createWrapper(queryClient),
    });
    await waitFor(() => expect(result.current.failedCount).toBe(1));

    const requestedUids: string[] = [];
    mockLoadPlayDetail.mockImplementation(async (_uid: string) => {
      requestedUids.push(_uid);
      return { play: { miss: 0 } };
    });
    await act(async () => { result.current.retryFailed(); });
    await waitFor(() => expect(result.current.failedCount).toBe(0));

    expect(requestedUids).toEqual(['0-47']);
    expect(museDashMissDetail(result.current.missByChart.get('0-47:4'))).toEqual({ status: 'known', miss: 0 });
    expect(museDashMissDetail(result.current.missByChart.get('0-48:0'))).toEqual({ status: 'unknown' });
  });
});
