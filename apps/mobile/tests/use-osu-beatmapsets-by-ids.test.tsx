import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { afterEach, jest } from '@jest/globals';
import { normalizeOsuBeatmapsetDetail, type OsuBeatmapsetLookupRaw, type OsuBestScore, type OsuBestScoreRaw } from '@/domain/osu';
import { useOsuBeatmapsetUserScores } from '@/hooks/use-osu-known-scores';
import { useOsuBeatmapsetDetail } from '@/hooks/use-osu-beatmapset-detail';
import { queryClient as publishedQueryClient } from '@/state/query-client';
import { useOsuBeatmapsetsByIds } from '@/hooks/use-osu-beatmapsets-by-ids';
import { useOsuCatalogSearch } from '@/hooks/use-osu-catalog';

const mockGetBeatmapset = jest.fn<(id: string, signal: AbortSignal) => Promise<OsuBeatmapsetLookupRaw>>();
const mockGetUserScore = jest.fn<(user: number, beatmap: number, game: string, signal: AbortSignal) => Promise<OsuBestScoreRaw | null>>();
const mockGetPublicBeatmapset = jest.fn(async (id: string, gameId: Parameters<typeof normalizeOsuBeatmapsetDetail>[1]) =>
  normalizeOsuBeatmapsetDetail(rawBeatmapset(Number(id)), gameId));
const mockPublicSearch = jest.fn(async (params: { gameId: Parameters<typeof normalizeOsuBeatmapsetDetail>[1]; page: number; q?: string }) => ({
  songs: [normalizeOsuBeatmapsetDetail(rawBeatmapset(3720 + params.page), params.gameId)],
  nextPage: params.page === 0 ? 1 : undefined,
}));
jest.mock('@/providers/osu-public-catalog-provider', () => ({ OsuPublicCatalogProvider: class {
  getBeatmapset(id: string, gameId: Parameters<typeof normalizeOsuBeatmapsetDetail>[1]) { return mockGetPublicBeatmapset(id, gameId); }
  searchBeatmapsets(params: { gameId: Parameters<typeof normalizeOsuBeatmapsetDetail>[1]; page: number; q?: string }) { return mockPublicSearch(params); }
} }));
const mockMergeKnownScores = jest.fn(async (_game: string, _user: number, scores: readonly OsuBestScore[]) => ({
  items: Object.fromEntries(scores.map(score => [String(score.beatmap.id), score])),
  source: { kind: 'osu', label: 'osu.ppy.sh', updatedAt: '2026-09-30T00:00:00Z', isStale: false },
}));
jest.mock('@/services/osu-cache', () => ({ OsuCache: class {
  mergeKnownScores(game: string, user: number, scores: readonly OsuBestScore[]) { return mockMergeKnownScores(game, user, scores); }
  loadKnownScores() { return Promise.resolve(null); }
} }));
let mockProviderId: string | null = 'osu';
let mockSession: Record<string, unknown> | null = { mode: 'osu-oauth' };
let mockTabActive = true;

jest.mock('@/providers/osu-score-provider', () => ({
  OsuScoreProvider: class {
    getBeatmapset(id: string, signal: AbortSignal) { return mockGetBeatmapset(id, signal); }
    getUserBeatmapScore(user: number, beatmap: number, game: string, signal: AbortSignal) { return mockGetUserScore(user, beatmap, game, signal); }
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
jest.mock('@/components/CachedTabScreen', () => ({
  useCachedTabActive: () => mockTabActive,
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
    mockTabActive = true;
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
    expect(mockGetBeatmapset.mock.calls.map(([id]) => id)).toEqual(['3720', '9999']);
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

  it('分四路补齐个人曲库，并在等值 ID 重渲染时继续当前请求', async () => {
    let inFlight = 0;
    let maximum = 0;
    const releases: (() => void)[] = [];
    const signals: AbortSignal[] = [];
    mockGetBeatmapset.mockImplementation((id, signal) => new Promise(resolve => {
      signals.push(signal);
      inFlight++;
      maximum = Math.max(maximum, inFlight);
      releases.push(() => { inFlight--; resolve(rawBeatmapset(Number(id))); });
    }));
    const ids = Array.from({ length: 9 }, (_, index) => String(index + 1));
    const screen = await renderHook(() => useOsuBeatmapsetsByIds('osu-standard', [...ids]), {
      wrapper: createWrapper(queryClient),
    });
    await waitFor(() => expect(inFlight).toBe(4));
    await screen.rerender({});
    expect(signals.every(signal => !signal.aborted)).toBe(true);
    for (let batch = 0; batch < 3; batch++) {
      await act(async () => {
        releases.splice(0).reverse().forEach(release => release());
        await new Promise(resolve => setTimeout(resolve, 0));
      });
    }
    await waitFor(() => expect(screen.result.current.data.size).toBe(ids.length));
    expect(maximum).toBe(4);
    expect(ids.map(id => screen.result.current.data.get(id)?.title)).toEqual(ids.map(id => `Title ${id}`));
  });

  it('卸载后取消在途详情，不再补取其余收藏', async () => {
    const signals: AbortSignal[] = [];
    const requested: string[] = [];
    mockGetBeatmapset.mockImplementation((id, signal) => new Promise((_resolve, reject) => {
      requested.push(id);
      signals.push(signal);
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    }));
    const ids = Array.from({ length: 8 }, (_, index) => String(index + 1));
    const screen = await renderHook(() => useOsuBeatmapsetsByIds('osu-standard', ids), {
      wrapper: createWrapper(queryClient),
    });
    await waitFor(() => expect(signals).toHaveLength(4));
    await screen.unmount();
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(signals.every(signal => signal.aborted)).toBe(true);
    expect(requested).toEqual(ids.slice(0, 4));
  });

  it('标签失焦时保留绑定状态但不发请求', async () => {
    mockTabActive = false;
    const { result } = await renderHook(
      () => useOsuBeatmapsetsByIds('osu-standard', ['3720']),
      { wrapper: createWrapper(queryClient) },
    );

    expect(result.current.bound).toBe(true);
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

  it('示例账号无 OAuth 也能读取曲库、详情和个人曲库歌曲，不读取或缓存玩家分数', async () => {
    mockProviderId = 'osu-test'; mockSession = null;
    const input = { q: '歌曲', general: [], status: 'any' as const, genre: 0, language: 0, nsfw: false, extras: [] };
    const screen = await renderHook(() => ({
      detail: useOsuBeatmapsetDetail('osu-standard', '3720'),
      library: useOsuBeatmapsetsByIds('osu-standard', ['3720']),
      catalog: useOsuCatalogSearch('osu-standard', input),
      scores: useOsuBeatmapsetUserScores('osu-standard', scoreSong()),
    }), { wrapper: createWrapper(queryClient) });
    await waitFor(() => expect(screen.result.current.detail.data?.title).toBe('Title 3720'));
    await waitFor(() => expect(screen.result.current.catalog.songs[0]?.title).toBe('Title 3720'));
    expect(screen.result.current.library.data.get('3720')?.title).toBe('Title 3720');
    expect(mockPublicSearch).toHaveBeenCalledWith({ gameId: 'osu-standard', page: 0, q: '歌曲' });
    expect(mockGetBeatmapset).not.toHaveBeenCalled();
    expect(mockGetUserScore).not.toHaveBeenCalled();
    expect(mockMergeKnownScores).not.toHaveBeenCalled();
    await act(async () => { await screen.result.current.catalog.fetchNextPage(); });
    await waitFor(() => expect(screen.result.current.catalog.songs.map((song) => song.beatmapSetId)).toEqual([3720, 3721]));
  });
});


function scoreSong() {
  const raw = rawBeatmapset(3720);
  return normalizeOsuBeatmapsetDetail({ ...raw, beatmaps: Array.from({ length: 13 }, (_, index) => ({
    ...raw.beatmaps![0], id: index + 1,
  })) }, 'osu-standard');
}

describe('osu detail score batch', () => {
  let client: QueryClient;
  beforeEach(() => {
    jest.clearAllMocks(); mockProviderId = 'osu'; mockSession = { mode: 'osu-oauth' };
    mockTabActive = true;
    client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  });
  afterEach(() => { cleanup(); client.clear(); publishedQueryClient.clear(); });
  it('waits for route activity before fetching details and scores without dropping cached data on blur', async () => {
    mockTabActive = false;
    mockGetBeatmapset.mockResolvedValue(rawBeatmapset(3720));
    mockGetUserScore.mockResolvedValue(null);
    const song = scoreSong();
    const screen = await renderHook(() => ({
      detail: useOsuBeatmapsetDetail('osu-standard', '3720'),
      scores: useOsuBeatmapsetUserScores('osu-standard', song),
    }), { wrapper: createWrapper(client) });
    expect(mockGetBeatmapset).not.toHaveBeenCalled();
    expect(mockGetUserScore).not.toHaveBeenCalled();
    mockTabActive = true;
    await screen.rerender({});
    await waitFor(() => expect(screen.result.current.detail.data?.title).toBe('Title 3720'));
    await waitFor(() => expect(screen.result.current.scores.data).toEqual([]));
    mockTabActive = false;
    await screen.rerender({});
    expect(screen.result.current.detail.data?.title).toBe('Title 3720');
    expect(screen.result.current.scores.data).toEqual([]);
  });
  it('最多四路请求并保留歌曲难度顺序', async () => {
    let inFlight = 0; let maximum = 0; const releases: (() => void)[] = [];
    mockGetUserScore.mockImplementation((_user, beatmap) => new Promise(resolve => {
      inFlight++; maximum = Math.max(maximum, inFlight);
      releases.push(() => { inFlight--; resolve({ id: beatmap, accuracy: 1, total_score: 1000, rank: 'S', mods: [] }); });
    }));
    const song = scoreSong();
    const screen = await renderHook(() => useOsuBeatmapsetUserScores('osu-standard', song), { wrapper: createWrapper(client) });
    await waitFor(() => expect(mockGetUserScore).toHaveBeenCalledTimes(4));
    for (let batch = 0; batch < 4; batch++) {
      await act(async () => { releases.splice(0).reverse().forEach(release => release()); await new Promise(resolve => setTimeout(resolve, 0)); });
    }
    await waitFor(() => expect(screen.result.current.isSuccess).toBe(true));
    expect(maximum).toBe(4);
    expect(screen.result.current.data?.map(score => score.beatmap.id)).toEqual(song.beatmaps.map(beatmap => beatmap.id));
  });
  it('单项失败后仍合并已成功成绩，再报告失败', async () => {
    mockGetUserScore.mockImplementation(async (_user, beatmap) => {
      if (beatmap === 2) throw new Error('failed');
      return { id: beatmap, accuracy: 1, total_score: 1000, rank: 'S', mods: [] };
    });
    const song = scoreSong();
    const screen = await renderHook(() => useOsuBeatmapsetUserScores('osu-standard', song), { wrapper: createWrapper(client) });
    await waitFor(() => expect(screen.result.current.isError).toBe(true));
    expect(mockMergeKnownScores).toHaveBeenCalledTimes(1);
    expect(mockMergeKnownScores.mock.calls[0][2].map(score => score.beatmap.id)).toEqual(song.beatmaps.map(beatmap => beatmap.id).filter(id => id !== 2));
  });
  it('取消四个在途请求后不继续领取剩余难度', async () => {
    const releases: (() => void)[] = [];
    mockGetUserScore.mockImplementation((_user, beatmap) => new Promise(resolve => {
      releases.push(() => resolve({ id: beatmap, accuracy: 1, total_score: 1000, rank: 'S', mods: [] }));
    }));
    const song = scoreSong();
    const screen = await renderHook(() => useOsuBeatmapsetUserScores('osu-standard', song), { wrapper: createWrapper(client) });
    await waitFor(() => expect(mockGetUserScore).toHaveBeenCalledTimes(4));
    await screen.unmount();
    await act(async () => { releases.splice(0).forEach(release => release()); await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(mockGetUserScore).toHaveBeenCalledTimes(4);
    expect(mockMergeKnownScores).not.toHaveBeenCalled();
  });
});
