import { MUSE_DASH_QUERY_OPTIONS, MUSE_DASH_SESSION_RESOURCE_QUERY_OPTIONS, museDashPlayerQueryOptions, type MuseDashSnapshot } from '@/services/muse-dash-query';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useBoundedQueries } from '@/hooks/use-bounded-queries';
import type { DataSource } from '@/domain/models';import type { MuseDashAlbumsResponse, MuseDashCeResponse, MuseDashDiffdiffEntry, MuseDashMissDetailValue, MuseDashPlayDetail, MuseDashPlayer } from '@/domain/muse-dash';
import { MUSE_DASH_MISS_DETAIL_FAILED } from '@/domain/muse-dash';
import { isMuseDashTestUserId } from '@/domain/bound-account';
import { museDashProvider } from '@/providers/muse-dash-provider';
import { maxedMuseDashPlayDetailSnapshot } from '@/providers/maxed-musedash-test-provider';


import { queryClient } from '@/state/query-client';

import { useCachedTabActive } from '@/components/CachedTabScreen';
import { loadMuseDashAlbumsFresh, loadMuseDashCeFresh, loadMuseDashDiffdiffFresh, loadMuseDashPlayDetailFresh, makeMuseDashSnapshot } from '@/services/muse-dash-cache';



export type MuseDashQuery<T> = {
  data: T | undefined;
  source: DataSource | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  isFetching: boolean;
  refetch: () => Promise<unknown>;
};

function useMuseDashSnapshot<T>(
  queryKey: readonly unknown[],
  load: (signal: AbortSignal) => Promise<MuseDashSnapshot<T>>,
  enabled = true,
  queryOptions: {
    staleTime: number;
    gcTime: number;
    refetchOnMount?: false;
    refetchOnReconnect?: false;
  } = MUSE_DASH_QUERY_OPTIONS,
): MuseDashQuery<T> {
  const tabActive = useCachedTabActive();
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => load(signal),
    enabled: enabled && tabActive,
    notifyOnChangeProps: tabActive ? undefined : [],
    ...queryOptions,
  });
  const snapshot = query.data as MuseDashSnapshot<T> | undefined;
  return {
    data: snapshot?.data,
    source: snapshot?.source,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error as Error | null,
    isFetching: query.isFetching,
    refetch: query.refetch,
  };
}

export function useMuseDashSearch(query: string) {
  const normalized = query.trim();
  return useQuery({
    queryKey: ['musedash', 'players', 'search', normalized],
    queryFn: ({ signal }) => museDashProvider.searchPlayers(normalized, signal),
    enabled: normalized.length > 0,
    ...MUSE_DASH_QUERY_OPTIONS,
  });
}

export function useMuseDashPlayer(userId: string | null, enabled = true) {
  const tabActive = useCachedTabActive();
  const query = useQuery({
    ...museDashPlayerQueryOptions(queryClient, userId ?? ''),
    enabled: enabled && tabActive && userId !== null,
    notifyOnChangeProps: tabActive ? undefined : [],
  });
  const snapshot = query.data as MuseDashSnapshot<MuseDashPlayer> | undefined;
  return {
    data: snapshot?.data,
    source: snapshot?.source,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error as Error | null,
    isFetching: query.isFetching,
    refetch: query.refetch,
  };
}

export function useMuseDashPlayDetail(
  uid: string | null,
  difficulty: number | null,
  platform: string | null,
  userId: string | null,
) {
  const enabled = uid !== null && difficulty !== null && platform !== null && userId !== null;
  const queryKey = ['musedash', 'play-detail', userId, uid, difficulty, platform] as const;
  return useMuseDashSnapshot<MuseDashPlayDetail>(queryKey, async (signal) => {
    if (userId !== null && isMuseDashTestUserId(userId)) {
      return maxedMuseDashPlayDetailSnapshot();
    }
    const detail = await loadMuseDashPlayDetailFresh(uid!, difficulty!, platform!, userId!, signal);
    return makeMuseDashSnapshot(detail);
  }, enabled);
}

const MUSE_DASH_DETAIL_CONCURRENCY = 6;

export type MuseDashPlayDetailsResult = {
  /** 键为 uid:difficulty。 */
  missByChart: ReadonlyMap<string, MuseDashMissDetailValue>;
  failedCount: number;
  retryFailed: () => void;
};

/** null 表示未完成，undefined 表示上游缺失，FAILED 表示请求失败；仅数字参与成就判定。 */
export function useMuseDashPlayDetails(
  items: readonly { uid: string; difficulty: number; platform: string }[],
  userId: string | null,
  enabled: boolean,
): MuseDashPlayDetailsResult {
  const queryDefs = useMemo(() => enabled && userId !== null ? items.map((item) => ({
    queryKey: ['musedash', 'play-detail', userId, item.uid, item.difficulty, item.platform] as const,
    queryFn: async ({ signal }: { signal: AbortSignal }): Promise<MuseDashSnapshot<MuseDashPlayDetail>> => {
      if (isMuseDashTestUserId(userId)) return maxedMuseDashPlayDetailSnapshot();
      const detail = await loadMuseDashPlayDetailFresh(item.uid, item.difficulty, item.platform, userId, signal);
      return makeMuseDashSnapshot(detail);
    },
    ...MUSE_DASH_QUERY_OPTIONS,
  })) : [], [items, userId, enabled]);
  const { queries, retryFailed } = useBoundedQueries(queryDefs, MUSE_DASH_DETAIL_CONCURRENCY, enabled, false);
  const missByChart = useMemo(() => {
    const map = new Map<string, MuseDashMissDetailValue>();
    const count = enabled ? items.length : 0;
    for (let index = 0; index < count; index += 1) {
      const item = items[index];
      const query = queries[index];
      if (!item) continue;
      if (!query) { map.set(`${item.uid}:${item.difficulty}`, null); continue; }
      const key = `${item.uid}:${item.difficulty}`;
      if (query.isError) map.set(key, MUSE_DASH_MISS_DETAIL_FAILED);
      else if (!query.isFetched || query.isLoading) map.set(key, null);
      else map.set(key, query.data?.data?.play?.miss);
    }
    return map;
  }, [enabled, items, queries]);
  const failedCount = useMemo(
    () => [...missByChart.values()].filter((value) => value === MUSE_DASH_MISS_DETAIL_FAILED).length,
    [missByChart],
  );
  return { missByChart, failedCount, retryFailed };
}

export function useMuseDashAlbums(enabled = true) {
  const queryKey = ['musedash', 'albums'] as const;
  return useMuseDashSnapshot<MuseDashAlbumsResponse>(queryKey, async (signal) => {
    return makeMuseDashSnapshot(await loadMuseDashAlbumsFresh(signal));
  }, enabled, MUSE_DASH_SESSION_RESOURCE_QUERY_OPTIONS);
}

export function useMuseDashCe(enabled = true) {
  const queryKey = ['musedash', 'ce'] as const;
  return useMuseDashSnapshot<MuseDashCeResponse>(queryKey, async (signal) => {
    return makeMuseDashSnapshot(await loadMuseDashCeFresh(signal));
  }, enabled, MUSE_DASH_SESSION_RESOURCE_QUERY_OPTIONS);
}

export function useMuseDashDiffdiff(enabled = true) {
  const queryKey = ['musedash', 'diffdiff'] as const;
  return useMuseDashSnapshot<MuseDashDiffdiffEntry[]>(queryKey, async (signal) => {
    return makeMuseDashSnapshot(await loadMuseDashDiffdiffFresh(signal));
  }, enabled, MUSE_DASH_SESSION_RESOURCE_QUERY_OPTIONS);
}
