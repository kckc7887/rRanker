import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { MUSE_DASH_MISS_DETAIL_FAILED, museDashMissDetail } from '@/domain/muse-dash';
import { useMuseDashPlayDetails } from '@/hooks/use-muse-dash';
import { useBoundedQueries } from '@/hooks/use-bounded-queries';
import { releaseInactiveQueries } from '@/state/query-client';

type PlayDetailPayload = { play: { acc?: number; miss?: number } };

const mockLoadPlayDetail = jest.fn(async (
  ..._args: [string, number, string, string, AbortSignal?]
): Promise<PlayDetailPayload> => {
  if (_args[0] === '0-47') throw new Error('detail request failed');
  return { play: { acc: 100 } };
});

let mockTabActive = true;
jest.mock('@/components/CachedTabScreen', () => ({ useCachedTabActive: () => mockTabActive }));
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
    jest.clearAllMocks(); mockTabActive = true;
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
    await waitFor(() => expect(result.current.missByChart.get('0-47:4')).toBe(0));

    expect(requestedUids).toEqual(['0-47']);
    expect(museDashMissDetail(result.current.missByChart.get('0-47:4'))).toEqual({ status: 'known', miss: 0 });
    expect(museDashMissDetail(result.current.missByChart.get('0-48:0'))).toEqual({ status: 'unknown' });
  });
});


it('成就筛选禁用时不建立明细查询或全量观察者', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const many = Array.from({ length: 1000 }, (_, index) => ({ uid: `off-${index}`, difficulty: 0, platform: 'mobile' }));
  const screen = await renderHook(() => useMuseDashPlayDetails(many, 'off-user', false), { wrapper: createWrapper(client) });
  expect(client.getQueryCache().getAll()).toHaveLength(0);
  expect(screen.result.current.missByChart.size).toBe(0);
  await screen.unmount(); client.clear();
});

it('加载只给已领取条目创建观察者，取消后不领取后续条目', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const releases: (() => void)[] = [];
  const many = Array.from({ length: 40 }, (_, index) => ({ uid: `bounded-${index}`, difficulty: 0, platform: 'mobile' }));
  mockLoadPlayDetail.mockClear();
  mockLoadPlayDetail.mockImplementation(() => new Promise(resolve => { releases.push(() => resolve({ play: { miss: 0 } })); }));
  const screen = await renderHook(({ enabled }: { enabled: boolean }) => useMuseDashPlayDetails(many, 'bounded-user', enabled), {
    initialProps: { enabled: true }, wrapper: createWrapper(client),
  });
  await waitFor(() => expect(mockLoadPlayDetail).toHaveBeenCalledTimes(6));
  expect(client.getQueryCache().getAll()).toHaveLength(6);
  expect(client.getQueryCache().getAll().reduce((count, query) => count + query.getObserversCount(), 0)).toBe(6);
  await screen.rerender({ enabled: false });
  await act(async () => { releases.forEach(release => release()); await new Promise(resolve => setTimeout(resolve, 0)); });
  expect(mockLoadPlayDetail).toHaveBeenCalledTimes(6);
  await screen.unmount(); client.clear();
});

it('失败重试同样最多六路，并保留成功项', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const many = Array.from({ length: 19 }, (_, index) => ({ uid: `retry-${index}`, difficulty: 0, platform: 'mobile' }));
  mockLoadPlayDetail.mockImplementation(async uid => {
    if (uid === 'retry-18') return { play: { miss: 1 } };
    throw new Error('failed');
  });
  const screen = await renderHook(() => useMuseDashPlayDetails(many, 'retry-user', true), { wrapper: createWrapper(client) });
  await waitFor(() => expect(screen.result.current.failedCount).toBe(18));
  let inFlight = 0; let maximum = 0; let count = 0;
  const releases: (() => void)[] = [];
  mockLoadPlayDetail.mockImplementation(() => new Promise(resolve => {
    inFlight++; count++; maximum = Math.max(maximum, inFlight);
    releases.push(() => { inFlight--; resolve({ play: { miss: 0 } }); });
  }));
  await act(async () => { screen.result.current.retryFailed(); });
  await waitFor(() => expect(count).toBe(6));
  for (let batch = 0; batch < 3; batch++) {
    await act(async () => { releases.splice(0).forEach(release => release()); await new Promise(resolve => setTimeout(resolve, 0)); });
  }
  await waitFor(() => expect(screen.result.current.failedCount).toBe(0));
  expect(maximum).toBe(6); expect(count).toBe(18);
  expect(screen.result.current.missByChart.get('retry-18:0')).toBe(1);
  await screen.unmount(); client.clear();
});


it('四路公共批量查询保持逐项键、部分成功和取消边界', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const releases: (() => void)[] = []; let started = 0;
  const definitions = Array.from({ length: 15 }, (_, index) => ({
    queryKey: ['majdata-net', 'song', `song-${index}`], staleTime: Infinity,
    queryFn: async () => { started++; return new Promise<string>(resolve => { releases.push(() => resolve(`song-${index}`)); }); },
  }));
  const screen = await renderHook(({ enabled }: { enabled: boolean }) => useBoundedQueries(definitions, 4, enabled), {
    initialProps: { enabled: true }, wrapper: createWrapper(client),
  });
  await waitFor(() => expect(started).toBe(4));
  expect(client.getQueryCache().getAll()).toHaveLength(4);
  await act(async () => { releases.shift()!(); await new Promise(resolve => setTimeout(resolve, 0)); });
  await waitFor(() => expect(started).toBe(5));
  expect(client.getQueryData(definitions[0].queryKey)).toBe('song-0');
  await screen.rerender({ enabled: false });
  await act(async () => { releases.splice(0).forEach(release => release()); await new Promise(resolve => setTimeout(resolve, 0)); });
  expect(started).toBe(5);
  expect(client.getQueryData(definitions[0].queryKey)).toBe('song-0');
  await screen.unmount(); client.clear();
});

it('可见明细保持活动缓存，失效后的自动重取仍最多六路', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const many = Array.from({ length: 19 }, (_, index) => ({ uid: `invalidate-${index}`, difficulty: 0, platform: 'mobile' }));
  mockLoadPlayDetail.mockImplementation(async () => ({ play: { miss: 0 } }));
  const screen = await renderHook(() => useMuseDashPlayDetails(many, 'invalidate-user', true), { wrapper: createWrapper(client) });
  await waitFor(() => expect([...screen.result.current.missByChart.values()]).toEqual(Array(19).fill(0)));
  expect(client.getQueryCache().getAll().every(query => query.isActive())).toBe(true);
  releaseInactiveQueries(client);
  expect(client.getQueryCache().getAll()).toHaveLength(19);
  let inFlight = 0; let maximum = 0; let count = 0;
  const releases: (() => void)[] = [];
  mockLoadPlayDetail.mockImplementation(() => new Promise(resolve => {
    inFlight++; count++; maximum = Math.max(maximum, inFlight);
    releases.push(() => { inFlight--; resolve({ play: { miss: 1 } }); });
  }));
  const refreshed = client.invalidateQueries({ queryKey: ['musedash', 'play-detail', 'invalidate-user'] });
  await waitFor(() => expect(count).toBe(6));
  for (let batch = 0; batch < 4; batch++) {
    await act(async () => { releases.splice(0).forEach(release => release()); await new Promise(resolve => setTimeout(resolve, 0)); });
  }
  await act(async () => { await refreshed; });
  expect(maximum).toBe(6); expect(count).toBe(19);
  await waitFor(() => expect([...screen.result.current.missByChart.values()]).toEqual(Array(19).fill(1)));
  await screen.unmount(); client.clear();
});

it('隐藏观察者停止缓存通知，根观察者仍收更新，激活读取最新版本', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const song = [{ uid: 'hidden', difficulty: 0, platform: 'mobile' }];
  mockLoadPlayDetail.mockImplementation(async () => ({ play: { miss: 0 } }));
  const key = ['musedash', 'play-detail', 'hidden-user', 'hidden', 0, 'mobile'];
  let pageRenders = 0;
  const page = await renderHook(({ active }: { active: boolean }) => {
    mockTabActive = active; pageRenders++; return useMuseDashPlayDetails(song, 'hidden-user', true);
  }, { initialProps: { active: true }, wrapper: createWrapper(client) });
  await waitFor(() => expect(page.result.current.missByChart.get('hidden:0')).toBe(0));
  const root = await renderHook(() => useQuery<{ data: PlayDetailPayload }>({ queryKey: key, queryFn: async () => ({ data: { play: { miss: 0 } } }), enabled: false }), { wrapper: createWrapper(client) });
  await page.rerender({ active: false });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  const before = pageRenders;
  await act(async () => {
    client.setQueryData(key, { data: { play: { miss: 3 } }, source: {} });
    await new Promise(resolve => setTimeout(resolve, 0));
  });
  expect(pageRenders).toBe(before);
  expect(root.result.current.data?.data.play.miss).toBe(3);
  await page.rerender({ active: true });
  expect(page.result.current.missByChart.get('hidden:0')).toBe(3);
  await root.unmount(); await page.unmount(); client.clear(); mockTabActive = true;
});
