import type { PropsWithChildren } from 'react';
import { jest } from '@jest/globals';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react-native';
import { fixtureCatalog } from '@/fixtures/sanitized';
import type { AliasSnapshot, CatalogSnapshot, Song } from '@/domain/models';
import { queryClient } from '@/state/query-client';
import {
  MAIMAI_CATALOG_QUERY_KEY,
  useDetailedCatalog,
  useMaimaiSongDetail,
  useTransientDetailedMaimaiCatalog,
} from '@/hooks/use-detailed-catalog';
import { useScoreSnapshot } from '@/hooks/use-score-snapshot';

const mockGetCatalog = jest.fn<() => Promise<CatalogSnapshot>>();
const mockGetDetailedCatalog = jest.fn<() => Promise<CatalogSnapshot>>();
const mockGetAliases = jest.fn<() => Promise<AliasSnapshot>>();
const mockGetSong = jest.fn<(songId: string, catalog?: CatalogSnapshot) => Promise<Song>>();
const mockUseGameData = jest.fn();
const mockCatalogProvider = {
  getCatalog: mockGetCatalog,
  getDetailedCatalog: mockGetDetailedCatalog,
  getAliases: mockGetAliases,
  getSong: mockGetSong,
};
let mockActiveAccountId = 'maimai:lxns:first';

jest.mock('@/components/CachedTabScreen', () => ({
  useCachedTabActive: () => true,
}));
jest.mock('@/hooks/use-game-data', () => ({
  useGameData: (enabled?: boolean) => mockUseGameData(enabled),
}));
jest.mock('@/state/session-store', () => ({
  UNBOUND_ACCOUNT_ID: 'maimai:unbound',
  useSession: (selector: (state: {
    activeAccountId: string;
    activeGameId: string;
    catalogProvider: {
      getCatalog: typeof mockGetCatalog;
      getDetailedCatalog: typeof mockGetDetailedCatalog;
      getAliases: typeof mockGetAliases;
      getSong: typeof mockGetSong;
    };
  }) => unknown) => selector({
    activeAccountId: mockActiveAccountId,
    activeGameId: 'maimai',
    catalogProvider: mockCatalogProvider,
  }),
}));

function wrapper({ children }: PropsWithChildren) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('舞萌曲库分层', () => {
  beforeEach(() => {
    queryClient.clear();
    jest.clearAllMocks();
    mockActiveAccountId = 'maimai:lxns:first';
    mockGetCatalog.mockResolvedValue(structuredClone(fixtureCatalog));
    mockGetDetailedCatalog.mockResolvedValue(structuredClone(fixtureCatalog));
    mockGetAliases.mockResolvedValue({ aliases: [], source: fixtureCatalog.source });
    mockGetSong.mockResolvedValue(structuredClone(fixtureCatalog.songs[0]));
    mockUseGameData.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });
  });

  afterEach(async () => {
    await cleanup();
    queryClient.clear();
  });

  it('切换舞萌账号复用同一份轻量索引', async () => {
    const hook = await renderHook(() => useDetailedCatalog(), { wrapper });
    await waitFor(() => expect(hook.result.current.data).toBeDefined());
    expect(hook.result.current.data?.songs[0].charts[0].notes).toBeUndefined();
    expect(mockGetCatalog).toHaveBeenCalledTimes(1);
    expect(mockGetDetailedCatalog).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(MAIMAI_CATALOG_QUERY_KEY)).toBeDefined();

    mockActiveAccountId = 'maimai:diving-fish:second';
    await hook.rerender({});

    expect(mockGetCatalog).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryCache().findAll({ queryKey: MAIMAI_CATALOG_QUERY_KEY })).toHaveLength(1);
    await hook.unmount();

    const second = await renderHook(() => useDetailedCatalog(), { wrapper });
    await waitFor(() => expect(second.result.current.data).toBeDefined());
    expect(mockGetCatalog).toHaveBeenCalledTimes(1);
    await second.unmount();
  });

  it('成绩页直接读取账号级 game-data 快照', async () => {
    const snapshot = {
      source: fixtureCatalog.source,
      catalogSource: fixtureCatalog.source,
      records: [],
    };
    mockUseGameData.mockReturnValue({
      data: { payload: { kind: 'maimai', snapshot } },
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });

    const hook = await renderHook(() => useScoreSnapshot(), { wrapper });

    expect(mockUseGameData).toHaveBeenCalledWith(true);
    expect(hook.result.current.data).toBe(snapshot);
    await hook.unmount();
  });

  it('单曲详情请求去重、失败后可重试，并在卸载后释放', async () => {
    let resolveSong!: (song: Song) => void;
    mockGetSong.mockImplementationOnce(() => new Promise<Song>((resolve) => {
      resolveSong = resolve;
    }));
    const detail = await renderHook(
      () => [
        useMaimaiSongDetail('1', fixtureCatalog),
        useMaimaiSongDetail('1', fixtureCatalog),
      ] as const,
      { wrapper },
    );
    await waitFor(() => expect(mockGetSong).toHaveBeenCalledTimes(1));
    await act(async () => resolveSong(structuredClone(fixtureCatalog.songs[0])));
    await waitFor(() => expect(detail.result.current[0].data).toBeDefined());
    expect(detail.result.current[1].data).toBeDefined();
    expect(mockGetSong).toHaveBeenCalledTimes(1);

    await detail.unmount();
    await waitFor(() => expect(queryClient.getQueryData(['maimai-song-detail', '1'])).toBeUndefined());

    mockGetSong.mockRejectedValueOnce(new Error('offline'));
    const retry = await renderHook(
      () => useMaimaiSongDetail('2', fixtureCatalog),
      { wrapper },
    );
    await waitFor(() => expect(retry.result.current.isError).toBe(true));
    mockGetSong.mockResolvedValueOnce(structuredClone(fixtureCatalog.songs[1]));
    await act(async () => {
      await retry.result.current.refetch();
    });
    await waitFor(() => expect(retry.result.current.data).toBeDefined());
    expect(mockGetSong).toHaveBeenCalledTimes(3);
    await retry.unmount();
  });

  it('没有完整曲库也会直接请求单曲详情', async () => {
    const detail = await renderHook(
      () => useMaimaiSongDetail('1', undefined),
      { wrapper },
    );

    await waitFor(() => expect(detail.result.current.data).toBeDefined());
    expect(mockGetCatalog).not.toHaveBeenCalled();
    expect(mockGetSong).toHaveBeenCalledWith('1', undefined, expect.any(AbortSignal));
    await detail.unmount();
  });

  it('详细整库只保存在功能局部状态', async () => {
    const hook = await renderHook(() => useTransientDetailedMaimaiCatalog(), { wrapper });
    await waitFor(() => expect(hook.result.current.data).toBeDefined());
    expect(mockGetDetailedCatalog).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryCache().findAll()).toHaveLength(0);
    await hook.unmount();
  });
});
