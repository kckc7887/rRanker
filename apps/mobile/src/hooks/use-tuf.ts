import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';
import {
  TUF_PAGE_SIZE,
  selectBestTufLevelPass,
  tufHttpsUrl,
  type TufLevelDetailResponse,
  type TufLevelPass,
  type TufLevelPage,
  type TufLevelQuery,
  type TufPassPage,
  type TufPassQuery,
  type TufPlayer,
} from '@/domain/tuf';
import { tufProvider } from '@/providers/tuf-provider';
import { cacheFirstLoad } from '@/services/cache-first';
import { queryClient } from '@/state/query-client';
import {
  loadTufPlayerFresh,
  makeTufSnapshot,
  TufCache,
} from '@/services/tuf-cache';

const TUF_QUERY_OPTIONS = { staleTime: 60_000, gcTime: 10 * 60_000 } as const;

const cache = new TufCache();

function pageIndexFromOffset(offset: number): number {
  return Math.floor(offset / TUF_PAGE_SIZE);
}

export function useTufPlayerSearch(query: string) {
  const normalized = query.trim();
  return useQuery({
    queryKey: ['tuf', 'players', 'search', normalized],
    queryFn: () => tufProvider.searchPlayers(normalized, TUF_PAGE_SIZE, 0),
    enabled: normalized.length > 0,
    ...TUF_QUERY_OPTIONS,
  });
}

export function useTufProfile(playerId: number | null) {
  const queryKey = ['tuf', 'player', playerId, 'profile'] as const;
  return useQuery({
    queryKey,
    queryFn: async (): Promise<TufPlayer> => {
      const snapshot = await cacheFirstLoad({
        loadCached: () => cache.loadPlayer(playerId!),
        loadFresh: async () => {
          const player = await loadTufPlayerFresh(playerId!);
          const fresh = makeTufSnapshot(player);
          void cache.savePlayer(playerId!, fresh).catch(() => undefined);
          return fresh;
        },
        onFresh: (fresh) => {
          queryClient.setQueryData(queryKey, fresh.data);
        },
      });
      return snapshot.data;
    },
    enabled: playerId !== null,
    ...TUF_QUERY_OPTIONS,
  });
}

function tufPassesQueryKey(playerId: number, options: Omit<TufPassQuery, 'offset' | 'limit'>) {
  return ['tuf', 'player', playerId, 'passes', options] as const;
}

function mergeTufPassPage(
  playerId: number,
  options: Omit<TufPassQuery, 'offset' | 'limit'>,
  page: TufPassPage,
): void {
  const queryKey = tufPassesQueryKey(playerId, options);
  queryClient.setQueryData<InfiniteData<TufPassPage>>(queryKey, (old) => {
    if (!old) return undefined;
    const entries = old.pages.map((item, index) => ({ page: item, pageParam: old.pageParams[index] ?? item.offset }));
    const existing = entries.findIndex((entry) => entry.page.offset === page.offset);
    if (existing >= 0) entries[existing] = { page, pageParam: page.offset };
    else entries.push({ page, pageParam: page.offset });
    entries.sort((left, right) => left.page.offset - right.page.offset);
    return { pages: entries.map((entry) => entry.page), pageParams: entries.map((entry) => entry.pageParam) };
  });
}

async function loadTufPassPage(
  playerId: number,
  options: Omit<TufPassQuery, 'offset' | 'limit'>,
  offset: number,
): Promise<TufPassPage> {
  const snapshot = await cacheFirstLoad({
    loadCached: () => cache.loadPassPage(playerId, options, offset),
    loadFresh: async () => {
      const page = await tufProvider.getPasses(playerId, {
        ...options, offset, limit: TUF_PAGE_SIZE,
      });
      const fresh = makeTufSnapshot(page);
      void cache.savePassPage(playerId, options, offset, fresh).catch(() => undefined);
      return fresh;
    },
    onFresh: (fresh) => mergeTufPassPage(playerId, options, fresh.data),
  });
  return snapshot.data;
}

export async function prefetchTufPassPage(
  playerId: number,
  options: Omit<TufPassQuery, 'offset' | 'limit'>,
  offset: number,
): Promise<TufPassPage> {
  const page = await loadTufPassPage(playerId, options, offset);
  mergeTufPassPage(playerId, options, page);
  return page;
}

export function useTufPasses(playerId: number | null, options: Omit<TufPassQuery, 'offset' | 'limit'>) {
  return useInfiniteQuery({
    queryKey: ['tuf', 'player', playerId, 'passes', options] as const,
    queryFn: ({ pageParam }): Promise<TufPassPage> => loadTufPassPage(playerId!, options, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last) => last.offset + last.passes.length < last.total
      ? last.offset + last.limit
      : undefined,
    enabled: playerId !== null,
    ...TUF_QUERY_OPTIONS,
  });
}

export function useTufLevelSearch(
  query: string,
  options: Omit<TufLevelQuery, 'query' | 'offset' | 'limit'> = {},
) {
  const normalized = query.trim();
  const queryKey = ['tuf', 'levels', normalized, options] as const;
  return useInfiniteQuery({
    queryKey,
    queryFn: async ({ pageParam }): Promise<TufLevelPage> => {
      const snapshot = await cacheFirstLoad({
        loadCached: () => cache.loadLevelPage({ ...options, query: normalized || undefined }, pageParam),
        loadFresh: async () => {
          const page = await tufProvider.searchLevels({
            ...options, query: normalized || undefined, offset: pageParam, limit: TUF_PAGE_SIZE,
          });
          const fresh = makeTufSnapshot(page);
          void cache.saveLevelPage({ ...options, query: normalized || undefined }, pageParam, fresh)
            .catch(() => undefined);
          return fresh;
        },
        onFresh: (fresh) => {
          const pageIndex = pageIndexFromOffset(pageParam);
          queryClient.setQueryData<InfiniteData<TufLevelPage>>(queryKey, (old) => {
            if (!old) return undefined;
            const pages = old.pages.map((page, index) => (index === pageIndex ? fresh.data : page));
            return { ...old, pages };
          });
        },
      });
      return snapshot.data;
    },
    initialPageParam: 0,
    getNextPageParam: (last) => last.hasMore ? last.offset + last.limit : undefined,
    ...TUF_QUERY_OPTIONS,
  });
}

export function useTufDifficulties() {
  const queryKey = ['tuf', 'difficulties'] as const;
  return useQuery({
    queryKey,
    queryFn: async () => {
      const snapshot = await cacheFirstLoad({
        loadCached: () => cache.loadDifficulties(),
        loadFresh: async () => {
          const list = await tufProvider.getDifficulties();
          const fresh = makeTufSnapshot(list);
          void cache.saveDifficulties(fresh).catch(() => undefined);
          return fresh;
        },
        onFresh: (fresh) => {
          queryClient.setQueryData(queryKey, fresh.data);
        },
      });
      return snapshot.data;
    },
    ...TUF_QUERY_OPTIONS,
  });
}

export function useTufVideoDetails(videoLink: string | null | undefined) {
  const normalized = tufHttpsUrl(videoLink);
  return useQuery({
    queryKey: ['tuf', 'media', 'video-details', normalized],
    queryFn: () => tufProvider.getVideoDetails(normalized!),
    enabled: normalized !== null,
    ...TUF_QUERY_OPTIONS,
  });
}

export function useTufLevelBestPass(levelId: number | null, playerId: number | null) {
  const query = useQuery({
    queryKey: ['tuf', 'level', levelId, 'passes'],
    queryFn: (): Promise<TufLevelPass[]> => tufProvider.getLevelPasses(levelId!),
    enabled: levelId !== null && playerId !== null,
    ...TUF_QUERY_OPTIONS,
  });
  return { ...query, data: selectBestTufLevelPass(query.data ?? [], playerId) };
}

export function useTufLevel(levelId: number | null) {
  const queryKey = ['tuf', 'level', levelId] as const;
  return useQuery({
    queryKey,
    queryFn: async (): Promise<TufLevelDetailResponse> => {
      const snapshot = await cacheFirstLoad({
        loadCached: () => cache.loadLevel(levelId!),
        loadFresh: async () => {
          const detail = await tufProvider.getLevel(levelId!);
          const fresh = makeTufSnapshot(detail);
          void cache.saveLevel(levelId!, fresh).catch(() => undefined);
          return fresh;
        },
        onFresh: (fresh) => {
          queryClient.setQueryData(queryKey, fresh.data);
        },
      });
      return snapshot.data;
    },
    enabled: levelId !== null,
    ...TUF_QUERY_OPTIONS,
  });
}
