import { act, cleanup, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { jest } from '@jest/globals';
import type { ReactNode } from 'react';
import type { OsuGameId } from '@/domain/game-mode-family';
import { normalizeOsuBeatmapsetDetail, OSU_RULESET_BY_GAME_ID } from '@/domain/osu';
import { useOsuDemoScores } from '@/hooks/use-osu-demo-scores';
import type { OsuPublicCatalogPage } from '@/providers/osu-public-catalog-provider';

const mockSearch = jest.fn<(params: { gameId: OsuGameId; page: number }, signal: AbortSignal) => Promise<OsuPublicCatalogPage>>();
let mockProviderId = 'osu-test';
let mockAccountId = 'osu-standard:test';
let mockActive = true;
jest.mock('@/providers/osu-public-catalog-provider', () => ({
  OsuPublicCatalogProvider: class {
    searchBeatmapsets(params: { gameId: OsuGameId; page: number }, signal: AbortSignal) {
      return mockSearch(params, signal);
    }
  },
}));
jest.mock('@/state/session-store', () => ({
  useSession: (selector: (state: Record<string, unknown>) => unknown) => selector({
    activeProviderId: mockProviderId, activeAccountId: mockAccountId,
  }),
}));
jest.mock('@/components/CachedTabScreen', () => ({ useCachedTabActive: () => mockActive }));

function page(ids: number[], gameId: OsuGameId, nextPage?: number): OsuPublicCatalogPage {
  return {
    nextPage,
    songs: ids.map((id) => normalizeOsuBeatmapsetDetail({
      id, title: `${gameId} ${id}`, artist: 'Artist', creator: 'Mapper', covers: {}, status: 'ranked',
      beatmaps: [{ id: id * 10, beatmapset_id: id, difficulty_rating: 8, version: 'High',
        mode: OSU_RULESET_BY_GAME_ID[gameId], max_combo: 100 }],
    }, gameId)),
  };
}

describe('osu! 示例分页查询', () => {
  let client: QueryClient;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  beforeEach(() => {
    jest.clearAllMocks(); mockProviderId = 'osu-test'; mockAccountId = 'osu-standard:test'; mockActive = true;
    client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  });
  afterEach(() => { cleanup(); client.clear(); });

  it('最佳和成绩查询共用页，追加去重，后页失败保留成功页并可重试', async () => {
    mockSearch.mockImplementation(async ({ gameId, page: offset }) => offset === 0
      ? page([1, 2], gameId, 1) : page([2, 3], gameId));
    const screen = await renderHook(() => ({
      best: useOsuDemoScores('osu-standard'),
      records: useOsuDemoScores('osu-standard'),
    }), { wrapper });
    await waitFor(() => expect(screen.result.current.best.scores).toHaveLength(2));
    expect(screen.result.current.records.scores).toEqual(screen.result.current.best.scores);
    mockSearch.mockRejectedValueOnce(new Error('offline'));
    await act(async () => { await screen.result.current.records.fetchNextPage(); });
    await waitFor(() => expect(screen.result.current.records.isFetchNextPageError).toBe(true));
    expect(screen.result.current.best.scores.map((score) => score.beatmapset.id)).toEqual([1, 2]);
    await act(async () => { await screen.result.current.best.fetchNextPage(); });
    await waitFor(() => expect(screen.result.current.records.scores.map((score) => score.beatmapset.id)).toEqual([1, 2, 3]));
    expect(screen.result.current.records.hasNextPage).toBe(false);
  });

  it('四模式与账号相互隔离，切换后取消旧后页并丢弃迟到结果', async () => {
    let finish!: (value: OsuPublicCatalogPage) => void;
    let oldSignal!: AbortSignal;
    mockSearch.mockImplementation(async ({ gameId, page: offset }, signal) => {
      if (gameId === 'osu-standard' && offset === 1) {
        oldSignal = signal;
        return new Promise((resolve) => { finish = resolve; });
      }
      return page([1], gameId, 1);
    });
    const screen = await renderHook(({ gameId }: { gameId: OsuGameId }) => useOsuDemoScores(gameId), {
      wrapper, initialProps: { gameId: 'osu-standard' },
    });
    await waitFor(() => expect(screen.result.current.scores[0]?.beatmapset.title).toBe('osu-standard 1'));
    await act(async () => { void screen.result.current.fetchNextPage(); });
    mockAccountId = 'osu-mania:test';
    await screen.rerender({ gameId: 'osu-mania' });
    await waitFor(() => expect(screen.result.current.scores[0]?.beatmapset.title).toBe('osu-mania 1'));
    expect(oldSignal.aborted).toBe(true);
    await act(async () => { finish(page([2], 'osu-standard')); });
    expect(screen.result.current.scores.map((score) => score.beatmapset.title)).toEqual(['osu-mania 1']);
    for (const gameId of ['osu-catch', 'osu-taiko'] as const) {
      mockAccountId = `${gameId}:test`;
      await screen.rerender({ gameId });
      await waitFor(() => expect(screen.result.current.scores[0]?.beatmapset.title).toBe(`${gameId} 1`));
    }
    mockAccountId = 'osu-standard:test';
    await screen.rerender({ gameId: 'osu-standard' });
    expect(screen.result.current.scores.map((score) => score.beatmapset.title)).toEqual(['osu-standard 1']);
  });

  it('隐藏页面和真实账号不启动示例查询', async () => {
    mockActive = false;
    const screen = await renderHook(() => useOsuDemoScores('osu-standard'), { wrapper });
    expect(screen.result.current.bound).toBe(true);
    expect(mockSearch).not.toHaveBeenCalled();
    mockActive = true; mockProviderId = 'osu';
    await screen.rerender({});
    expect(screen.result.current.bound).toBe(false);
    expect(mockSearch).not.toHaveBeenCalled();
  });
});
