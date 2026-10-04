import { TUF_QUERY_OPTIONS, TUF_SESSION_RESOURCE_QUERY_OPTIONS, tufPlayerQueryOptions } from '@/services/tuf-query';
import { captureResourceWrites } from '@/services/snapshot-cache-utils';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';
import { TUF_PAGE_SIZE, selectBestTufLevelPass, tufHttpsUrl, type TufLevelDetailResponse, type TufLevelPass, type TufLevelPage, type TufLevelQuery, type TufPassPage, type TufPassQuery, type TufPlayerSnapshot } from '@/domain/tuf';
import { tufProvider } from '@/providers/tuf-provider';


import { queryClient } from '@/state/query-client';
import { invalidateTufDifficulties } from '@/services/infinite-query-refresh';
import { useCachedTabActive } from '@/components/CachedTabScreen';




export function useTufProfile(playerId: number | null, enabled = true) {
  const tabActive = useCachedTabActive();
  return useQuery({
    ...tufPlayerQueryOptions(queryClient, playerId ?? 0),
    select: (snapshot: TufPlayerSnapshot) => snapshot.data,
    enabled: enabled && tabActive && playerId !== null,
    notifyOnChangeProps: tabActive ? undefined : [],
  });
}

export function useTufPlayerSearch(query: string) {
  const normalized = query.trim();
  return useQuery({
    queryKey: ['tuf', 'players', 'search', normalized],
    queryFn: ({ signal }) => tufProvider.searchPlayers(normalized, TUF_PAGE_SIZE, 0, signal),
    enabled: normalized.length > 0,
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
  signal?: AbortSignal,
): Promise<TufPassPage> {
  return tufProvider.getPasses(playerId, {
    ...options, offset, limit: TUF_PAGE_SIZE,
  }, signal);
}

export async function prefetchTufPassPage(
  playerId: number,
  options: Omit<TufPassQuery, 'offset' | 'limit'>,
  offset: number,
  signal?: AbortSignal,
): Promise<TufPassPage> {
  const assertCurrent = captureResourceWrites('adofai', signal, `adofai:tuf:${playerId}`);
  const page = await loadTufPassPage(playerId, options, offset, signal);
  assertCurrent();
  if (!signal?.aborted) mergeTufPassPage(playerId, options, page);
  return page;
}

export function useTufPasses(playerId: number | null, options: Omit<TufPassQuery, 'offset' | 'limit'>, enabled = true) {
  const tabActive = useCachedTabActive();
  return useInfiniteQuery({
    queryKey: ['tuf', 'player', playerId, 'passes', options] as const,
    queryFn: ({ pageParam, signal }): Promise<TufPassPage> => loadTufPassPage(playerId!, options, pageParam, signal),
    initialPageParam: 0,
    getNextPageParam: (last) => last.offset + last.passes.length < last.total
      ? last.offset + last.limit
      : undefined,
    enabled: enabled && tabActive && playerId !== null,
    notifyOnChangeProps: tabActive ? undefined : [],
    ...TUF_QUERY_OPTIONS,
  });
}

export function useTufLevelSearch(
  query: string,
  options: Omit<TufLevelQuery, 'query' | 'offset' | 'limit'> = {},
  enabled = true,
) {
  const tabActive = useCachedTabActive();
  const normalized = query.trim();
  const queryKey = ['tuf', 'levels', normalized, options] as const;
  return useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam, signal }): Promise<TufLevelPage> => tufProvider.searchLevels({
      ...options, query: normalized || undefined, offset: pageParam, limit: TUF_PAGE_SIZE,
    }, signal),
    initialPageParam: 0,
    getNextPageParam: (last) => last.hasMore ? last.offset + last.limit : undefined,
    enabled: enabled && tabActive,
    notifyOnChangeProps: tabActive ? undefined : [],
    ...TUF_QUERY_OPTIONS,
  });
}

export async function refreshTufDifficulties(): Promise<void> {
  await invalidateTufDifficulties();
}

export function useTufDifficulties(enabled = true) {
  const tabActive = useCachedTabActive();
  const queryKey = ['tuf', 'difficulties'] as const;
  return useQuery({
    queryKey,
    queryFn: ({ signal }) => tufProvider.getDifficulties(signal),
    enabled: enabled && tabActive,
    notifyOnChangeProps: tabActive ? undefined : [],
    ...TUF_SESSION_RESOURCE_QUERY_OPTIONS,
  });
}

export function useTufVideoDetails(videoLink: string | null | undefined, enabled = true) {
  const active = useCachedTabActive();
  return useQuery({ ...tufVideoDetailsQueryOptions(videoLink, enabled && active),
    notifyOnChangeProps: active ? undefined : [],
  });
}

export function tufVideoDetailsQueryOptions(videoLink: string | null | undefined, enabled = true) {
  const normalized = tufHttpsUrl(videoLink);
  return {
    queryKey: ['tuf', 'media', 'video-details', normalized],
    queryFn: ({ signal }: { signal: AbortSignal }) => tufProvider.getVideoDetails(normalized!, signal),
    enabled: enabled && normalized !== null,
    ...TUF_QUERY_OPTIONS,
  } as const;
}

export function useTufLevelBestPass(levelId: number | null, playerId: number | null) {
  const active = useCachedTabActive();
  const query = useQuery({
    queryKey: ['tuf', 'level', levelId, 'passes'],
    queryFn: ({ signal }): Promise<TufLevelPass[]> => tufProvider.getLevelPasses(levelId!, signal),
    notifyOnChangeProps: active ? undefined : [],
    enabled: active && levelId !== null && playerId !== null,
    ...TUF_QUERY_OPTIONS,
  });
  return { ...query, data: selectBestTufLevelPass(query.data ?? [], playerId) };
}

export function useTufLevel(levelId: number | null) {
  const active = useCachedTabActive();
  const queryKey = ['tuf', 'level', levelId] as const;
  return useQuery({
    queryKey,
    queryFn: ({ signal }): Promise<TufLevelDetailResponse> => tufProvider.getLevel(levelId!, signal),
    notifyOnChangeProps: active ? undefined : [],
    enabled: active && levelId !== null,
    ...TUF_QUERY_OPTIONS,
  });
}
