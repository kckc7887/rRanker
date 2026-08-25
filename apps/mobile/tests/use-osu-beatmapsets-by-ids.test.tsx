import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { afterEach, jest } from '@jest/globals';
import type { OsuBeatmapsetLookupRaw } from '@/domain/osu';
import { useOsuBeatmapsetsByIds } from '@/hooks/use-osu-beatmapsets-by-ids';

const mockGetBeatmapset = jest.fn<(id: string) => Promise<OsuBeatmapsetLookupRaw>>();
let mockProviderId: string | null = 'osu';
let mockSession: Record<string, unknown> | null = { mode: 'osu-oauth' };

jest.mock('@/providers/osu-score-provider', () => ({
  OsuScoreProvider: class {
    getBeatmapset(id: string) { return mockGetBeatmapset(id); }
  },
}));
jest.mock('@/state/session-store', () => ({
  applyOsuTokenRotation: jest.fn(),
  useSession: (selector: (state: Record<string, unknown>) => unknown) => selector({
    session: mockSession,
    activeProviderId: mockProviderId,
    activeAccountId: 'osu-standard:osu:2',
  }),
}));

function rawBeatmapset(id: number): OsuBeatmapsetLookupRaw {
  return {
    id,
    title: `Title ${id}`,
    artist: 'Artist',
    creator: 'Mapper',
    covers: { card: `https://example.com/${id}.jpg` },
    beatmaps: [{
      id: id * 10,
      beatmapset_id: id,
      difficulty_rating: 5.5,
      version: 'Hard',
      mode: 'osu',
    }],
  };
}

function createWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe('useOsuBeatmapsetsByIds', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    mockProviderId = 'osu';
    mockSession = { mode: 'osu-oauth' };
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    mockGetBeatmapset.mockImplementation(async (id) => rawBeatmapset(Number(id)));
  });

  afterEach(() => {
    cleanup();
    queryClient.clear();
  });

  it('去重多个 ID，并把成功详情按 beatmapset id 返回', async () => {
    const { result } = await renderHook(
      () => useOsuBeatmapsetsByIds('osu-standard', ['3720', '3720', '9999']),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.data.size).toBe(2));
    expect(mockGetBeatmapset).toHaveBeenCalledTimes(2);
    expect(mockGetBeatmapset).toHaveBeenNthCalledWith(1, '3720');
    expect(mockGetBeatmapset).toHaveBeenNthCalledWith(2, '9999');
    expect(result.current.data.get('3720')?.title).toBe('Title 3720');
  });

  it('未绑定 osu 时不发请求', async () => {
    mockProviderId = null;
    mockSession = null;
    const { result } = await renderHook(
      () => useOsuBeatmapsetsByIds('osu-standard', ['3720']),
      { wrapper: createWrapper(queryClient) },
    );

    expect(result.current.bound).toBe(false);
    expect(mockGetBeatmapset).not.toHaveBeenCalled();
  });

  it('部分详情失败时保留已经成功的详情', async () => {
    mockGetBeatmapset.mockImplementation(async (id) => {
      if (id === '9999') throw new Error('not found');
      return rawBeatmapset(Number(id));
    });
    const { result } = await renderHook(
      () => useOsuBeatmapsetsByIds('osu-standard', ['3720', '9999']),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data.has('3720')).toBe(true);
    expect(result.current.data.has('9999')).toBe(false);
  });

  it('复用单曲详情 query key 与 60 秒新鲜缓存', async () => {
    queryClient.setQueryData(
      ['osu-beatmapset-detail', 'osu-standard', 2, '3720'],
      {
        beatmapSetId: 3720,
        title: '详情页缓存',
        artist: 'Artist',
        creator: 'Mapper',
        cover: null,
        status: null,
        genreName: null,
        languageName: null,
        rating: null,
        favouriteCount: null,
        tags: [],
        beatmaps: [],
      },
    );
    const { result } = await renderHook(
      () => useOsuBeatmapsetsByIds('osu-standard', ['3720']),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.data.get('3720')?.title).toBe('详情页缓存'));
    expect(mockGetBeatmapset).not.toHaveBeenCalled();
  });
});
