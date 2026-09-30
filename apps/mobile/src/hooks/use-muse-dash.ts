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



/** Muse Dash 查询统一返回：data 为原始数据，source 为缓存快照来源（数据状态展示用）。 */
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

/** 玩家搜索保持内存缓存（绑定流程即时交互，不落快照）。 */
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

/** 单曲原始成绩明细（成就判定需要 miss 数）；按玩家+歌曲+难度+平台缓存优先，列表卡片懒加载。 */
export function useMuseDashPlayDetail(
  uid: string | null,
  difficulty: number | null,
  platform: string | null,
  userId: string | null,
) {
  const enabled = uid !== null && difficulty !== null && platform !== null && userId !== null;
  const queryKey = ['musedash', 'play-detail', userId, uid, difficulty, platform] as const;
  return useMuseDashSnapshot<MuseDashPlayDetail>(queryKey, async (signal) => {
    // 示例账号：全 AP（miss 0）直接生成，不请求 /rank 明细。
    if (userId !== null && isMuseDashTestUserId(userId)) {
      return maxedMuseDashPlayDetailSnapshot();
    }
    const detail = await loadMuseDashPlayDetailFresh(uid!, difficulty!, platform!, userId!, signal);
    return makeMuseDashSnapshot(detail);
  }, enabled);
}

const MUSE_DASH_DETAIL_CONCURRENCY = 6;

/** 批量 miss 明细的结果：明细表 + 失败计数 + 只重试失败项的入口。 */
export type MuseDashPlayDetailsResult = {
  /** key = `${uid}:${difficulty}` → 明细取值（pending / failed / unknown / known）。 */
  missByChart: ReadonlyMap<string, MuseDashMissDetailValue>;
  /** 最终失败的明细请求数；重试前不会自行恢复。 */
  failedCount: number;
  /** 只重试失败项，未失败与未请求的明细不受影响。 */
  retryFailed: () => void;
};

/** 批量单曲明细 miss 表（成就筛选用）：key = `${uid}:${difficulty}` → 明细取值。
 * null 表示请求尚未返回（pending，抽取前会等待明细到达），undefined 表示上游没有该字段（unknown，不会再变化），
 * MUSE_DASH_MISS_DETAIL_FAILED 表示请求最终失败（failed，页面据此提示并可单独重试）；
 * 只有已知数值才用于判定 AP/FC，pending、failed 与 unknown 都不算已满足。
 * 与 useMuseDashPlayDetail 共用同一 queryKey 且 queryFn 返回结构一致（完整快照），
 * 同 Key 查询无论由哪个 observer 执行，缓存 data 均为 `{ data, source }`，读取处解包 `data.data.play?.miss`。 */
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
      // 最终失败先于其他状态：失败请求不会再有数据，必须与「已取到但没有 miss 字段」分开。
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
