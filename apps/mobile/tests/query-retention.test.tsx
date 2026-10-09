import type { PropsWithChildren } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react-native';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fixtureCatalog } from '@/fixtures/sanitized';
import type { CatalogSnapshot } from '@/domain/models';
import type { MajdataRanking, MajdataSong } from '@/domain/majdata';
import type { DetailedCatalogProvider } from '@/providers/contracts';
import { useMaimaiDxTag } from '@/hooks/use-maimai-dxtag';
import { useMajdataRanking, useMajdataSongs } from '@/hooks/use-majdata';
import type { loadCachedMaimaiDxTag } from '@/services/maimai-dxtag-cache';
import { refreshMaimaiCatalog } from '@/services/maimai-catalog-query';
import { queryClient } from '@/state/query-client';

let mockActive = true;
const mockGetCatalog = jest.fn<() => Promise<CatalogSnapshot>>();
const mockLoadDxTag = jest.fn<typeof loadCachedMaimaiDxTag>();
const mockGetSongs = jest.fn<() => Promise<MajdataSong[]>>();
const mockGetRanking = jest.fn<() => Promise<MajdataRanking>>();
const mockCatalogProvider: DetailedCatalogProvider = {
  getCatalog: mockGetCatalog,
  getAliases: async () => ({ aliases: [], source: fixtureCatalog.source }),
  getDetailedCatalog: mockGetCatalog,
  getSong: async () => fixtureCatalog.songs[0],
  getPlates: async () => ({ plates: [], source: fixtureCatalog.source }),
  getCollections: async () => ({ items: [], source: fixtureCatalog.source }),
};

jest.mock('@/components/CachedTabScreen', () => ({ useCachedTabActive: () => mockActive }));
jest.mock('@/services/maimai-dxtag-cache', () => ({
  loadCachedMaimaiDxTag: (...args: Parameters<typeof loadCachedMaimaiDxTag>) => mockLoadDxTag(...args),
}));
jest.mock('@/providers/majdata-provider', () => ({ majdataProvider: {
  getSongs: () => mockGetSongs(), getRanking: () => mockGetRanking(),
} }));
jest.mock('@/services/majdata-service', () => ({
  loadMajdataParsedChart: jest.fn(), loadMajdataSong: jest.fn(), loadMajdataSongSnapshot: jest.fn(),
}));
jest.mock('@/state/session-store', () => ({
  UNBOUND_ACCOUNT_ID: 'maimai:unbound',
  useSession: (selector: (state: {
    activeAccountId: string; activeGameId: string; catalogProvider: DetailedCatalogProvider;
  }) => unknown) => selector({ activeAccountId: 'maimai:account', activeGameId: 'maimai', catalogProvider: mockCatalogProvider }),
}));

function wrapper({ children }: PropsWithChildren) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  queryClient.clear();
  jest.clearAllMocks();
  mockActive = true;
  mockGetCatalog.mockResolvedValue(fixtureCatalog);
  mockLoadDxTag.mockResolvedValue({ library: {}, source: fixtureCatalog.source, coversCatalog: true });
  mockGetSongs.mockResolvedValue([]);
  mockGetRanking.mockResolvedValue({ scores: [] });
});

afterEach(async () => {
  await cleanup();
  queryClient.clear();
  jest.useRealTimers();
});

describe('DXTag query coverage', () => {
  it('reuses complete data on remount and reloads after a catalog revision changes', async () => {
    const first = await renderHook(() => useMaimaiDxTag(), { wrapper });
    await waitFor(() => expect(first.result.current.data?.coversCatalog).toBe(true));
    const displayed = first.result.current.data;
    await first.unmount();
    const second = await renderHook(() => useMaimaiDxTag(), { wrapper });
    expect(second.result.current.data).toBe(displayed);
    expect(mockLoadDxTag).toHaveBeenCalledTimes(1);

    mockGetCatalog.mockResolvedValue({ ...fixtureCatalog, source: { ...fixtureCatalog.source, updatedAt: '2026-10-09T12:00:00.000Z' } });
    await act(async () => { await refreshMaimaiCatalog(queryClient, mockCatalogProvider); });
    await waitFor(() => expect(mockLoadDxTag).toHaveBeenCalledTimes(2));
    expect(mockLoadDxTag.mock.calls[1][0].source.updatedAt).toBe('2026-10-09T12:00:00.000Z');
    await waitFor(() => expect(second.result.current.data?.coversCatalog).toBe(true));
  });

  it.each(['incomplete', 'failed'] as const)('retries %s data when another observer mounts', async (state) => {
    if (state === 'incomplete') mockLoadDxTag.mockResolvedValueOnce({ library: {}, source: fixtureCatalog.source, coversCatalog: false });
    else mockLoadDxTag.mockRejectedValueOnce(new Error('offline'));
    const first = await renderHook(() => useMaimaiDxTag(), { wrapper });
    await waitFor(() => {
      if (state === 'incomplete') expect(first.result.current.data?.coversCatalog).toBe(false);
      else expect(first.result.current.isError).toBe(true);
    });
    await first.unmount();
    const second = await renderHook(() => useMaimaiDxTag(), { wrapper });
    await waitFor(() => expect(second.result.current.data?.coversCatalog).toBe(true));
    expect(mockLoadDxTag).toHaveBeenCalledTimes(2);
  });
});

const majdataQueries: { name: string; useResult: () => { data: unknown }; reads: () => number }[] = [
  { name: 'catalog', useResult: () => useMajdataSongs('timep', ''), reads: () => mockGetSongs.mock.calls.length },
  { name: 'search', useResult: () => useMajdataSongs('timep', 'sample'), reads: () => mockGetSongs.mock.calls.length },
  { name: 'ranking', useResult: () => useMajdataRanking('song', true), reads: () => mockGetRanking.mock.calls.length },
];

describe('Majdata query lifetime', () => {
  beforeEach(() => { jest.useFakeTimers(); });

  it.each(majdataQueries)('$name is reused before five minutes without observers, then fetched again', async ({ useResult, reads }) => {
    const first = await renderHook(useResult, { wrapper });
    await waitFor(() => expect(first.result.current.data).toBeDefined());
    const displayed = first.result.current.data;
    await first.unmount();
    await act(async () => { await jest.advanceTimersByTimeAsync(4 * 60_000); });
    const second = await renderHook(useResult, { wrapper });
    expect(second.result.current.data).toBe(displayed);
    expect(reads()).toBe(1);
    await second.unmount();
    await act(async () => { await jest.advanceTimersByTimeAsync(5 * 60_000 + 1); });
    const third = await renderHook(useResult, { wrapper });
    await waitFor(() => expect(third.result.current.data).toBeDefined());
    expect(reads()).toBe(2);
  });

  it.each(majdataQueries)('$name remains available while its mounted tab is inactive', async ({ useResult, reads }) => {
    mockActive = false;
    const hook = await renderHook(useResult, { wrapper });
    await act(async () => { await jest.advanceTimersByTimeAsync(6 * 60_000); });
    expect(reads()).toBe(0);
    mockActive = true;
    await hook.rerender({});
    await waitFor(() => expect(hook.result.current.data).toBeDefined());
    const displayed = hook.result.current.data;
    mockActive = false;
    await hook.rerender({});
    await act(async () => { await jest.advanceTimersByTimeAsync(6 * 60_000); });
    expect(hook.result.current.data).toBe(displayed);
    mockActive = true;
    await hook.rerender({});
    expect(hook.result.current.data).toBe(displayed);
    expect(reads()).toBe(1);
  });
});
