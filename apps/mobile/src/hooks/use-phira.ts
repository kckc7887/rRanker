import { captureResourceWrites } from '@/services/snapshot-cache-utils';
import { useEffect, useMemo, useRef } from 'react';
import { getForegroundAbortSignal } from '@/state/app-lifecycle';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { PhiraChart, PhiraChartPage, PhiraChartStatus, PhiraPlayerSnapshot } from '@/domain/phira';
import { phiraProvider } from '@/providers/phira-provider';
import { cacheFirstLoad } from '@/services/cache-first';
import { countPhiraChartZip } from '@/services/phira-chart-notes';
import { phiraCache, phiraSource } from '@/services/phira-cache';
import { phiraCatalogNextPage } from '@/domain/phira-filters';
import {
  loadPhiraPlayerFresh, queryPhiraChartBest, refreshAllPhiraBests, refreshPhiraSeedBests,
} from '@/services/phira-service';
import { queryClient } from '@/state/query-client';
import { useCachedTabActive } from '@/components/CachedTabScreen';

const OPTIONS = { staleTime: 60_000, gcTime: 10 * 60_000 } as const;

export function usePhiraPlayerSearch(value: string) {
  const query = value.trim();
  const numericId = /^\d+$/.test(query) ? Number(query) : null;
  return useQuery({
    queryKey: ['phira', 'players', query], enabled: query.length > 0,
    queryFn: async ({ signal }) => numericId ? [await phiraProvider.getUser(numericId, signal)] : phiraProvider.searchUsers(query, signal),
    ...OPTIONS,
  });
}

export function usePhiraPlayer(playerId: number | null, enabled = true) {
  const tabActive = useCachedTabActive();
  const key = ['phira', 'player', playerId] as const;
  return useQuery({
    queryKey: key, enabled: enabled && tabActive && playerId !== null,
    queryFn: async ({ signal }): Promise<PhiraPlayerSnapshot> => cacheFirstLoad({
      assertCurrent: captureResourceWrites('phira', signal, `phira:community:${playerId}`),
      loadCached: () => phiraCache.loadPlayer(playerId!),
      loadFresh: async () => {
        const assertCurrent = captureResourceWrites('phira', signal, `phira:community:${playerId}`);
        const fresh = await loadPhiraPlayerFresh(playerId!, signal);
        assertCurrent();
        void refreshPhiraSeedBests(fresh, signal)
          .then((bests) => {
            assertCurrent();
            if (!signal.aborted) queryClient.setQueryData(['phira', 'bests', playerId], bests);
          })
          .catch(() => undefined);
        return fresh;
      },
      onFresh: (fresh) => queryClient.setQueryData(key, fresh),
      signal,
    }),
    ...OPTIONS,
  });
}

export function usePhiraBests(playerId: number | null, enabled = true) {
  const tabActive = useCachedTabActive();
  return useQuery({
    queryKey: ['phira', 'bests', playerId], enabled: enabled && tabActive && playerId !== null,
    queryFn: () => phiraCache.loadBests(playerId!), ...OPTIONS,
  });
}

export function useRefreshAllPhiraBests(playerId: number | null) {
  const lifetime = useRef(new AbortController());
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    return () => controller.abort();
  }, [playerId]);
  return async () => {
    if (playerId === null) return null;
    const controller = new AbortController();
    const foreground = getForegroundAbortSignal();
    const cancel = () => controller.abort();
    const signals = [foreground, lifetime.current.signal];
    signals.forEach((signal) => signal.addEventListener('abort', cancel, { once: true }));
    if (signals.some((signal) => signal.aborted)) cancel();
    const assertCurrent = captureResourceWrites('phira', controller.signal, `phira:community:${playerId}`);
    try {
      assertCurrent();
      await loadPhiraPlayerFresh(playerId, controller.signal);
      assertCurrent();
      const value = await refreshAllPhiraBests(playerId, controller.signal);
      assertCurrent();
      queryClient.setQueryData(['phira', 'bests', playerId], value);
      return value;
    } finally {
      signals.forEach((signal) => signal.removeEventListener('abort', cancel));
    }
  };
}

export function usePhiraCharts(status: PhiraChartStatus, search: string, enabled = true) {
  const tabActive = useCachedTabActive();
  const normalized = search.trim();
  return useInfiniteQuery({
    queryKey: ['phira', 'charts', status, normalized], initialPageParam: 0,
    queryFn: ({ pageParam, signal }): Promise<PhiraChartPage> => phiraProvider.getCharts(
      { status, page: pageParam, search: normalized || undefined },
      signal,
    ),
    // Phira /chart 的 page=1 返回与 page=0 相同的首页，翻页须跳过 1（0 → 2 → 3 → …）。
    getNextPageParam: (last, pages) => phiraCatalogNextPage(pages, last),
    enabled: enabled && tabActive,
    ...OPTIONS,
  });
}

/** 按谱面 ID 批量读取（Phira 官方收藏页同款 /chart/multi-get），供个人曲库行展示。 */
export function usePhiraChartsByIds(ids: readonly number[]) {
  const sorted = useMemo(() => [...new Set(ids)].sort((a, b) => a - b), [ids]);
  return useQuery({
    queryKey: ['phira', 'charts-by-ids', sorted], enabled: sorted.length > 0,
    queryFn: ({ signal }) => phiraProvider.getChartsByIds(sorted, signal),
    ...OPTIONS,
  });
}

export function usePhiraChart(chartId: number | null) {
  return useQuery({
    queryKey: ['phira', 'chart', chartId], enabled: chartId !== null,
    queryFn: ({ signal }): Promise<PhiraChart> => phiraProvider.getChart(chartId!, signal), ...OPTIONS,
  });
}

export function usePhiraChartBest(playerId: number | null, chart: PhiraChart | undefined) {
  return useQuery({
    queryKey: ['phira', 'best', playerId, chart?.id], enabled: playerId !== null && !!chart,
    queryFn: async ({ signal }) => {
      const assertCurrent = captureResourceWrites('phira', signal, `phira:community:${playerId}`);
      const cached = await phiraCache.loadBests(playerId!);
      assertCurrent();
      const existing = cached?.items[String(chart!.id)];
      if (existing) return existing;
      const player = await phiraCache.loadPlayer(playerId!);
      assertCurrent();
      const pool = [...(player?.pool.bestPool ?? []), ...(player?.pool.recentPool ?? [])]
        .find((item) => item.chart.id === chart!.id);
      return queryPhiraChartBest(playerId!, chart!, pool?.rks ?? null, signal);
    }, ...OPTIONS,
  });
}

export function usePhiraUploader(userId: number | null) {
  return useQuery({ queryKey: ['phira', 'uploader', userId], enabled: userId !== null,
    queryFn: ({ signal }) => phiraProvider.getUploader(userId!, signal), ...OPTIONS });
}

export function usePhiraNotes(chart: PhiraChart | undefined, enabled = true) {
  return useQuery({
    queryKey: ['phira', 'notes', chart?.id, chart?.chartUpdated], enabled: enabled && !!chart?.file,
    queryFn: async ({ signal }) => {
      try {
        const data = await phiraProvider.downloadChart(chart!.file!, signal);
        const value: import('@/domain/phira').PhiraNoteSnapshot = { chartUpdated: chart!.chartUpdated ?? null, counts: await countPhiraChartZip(data, signal), source: phiraSource() };
        if (signal.aborted) {
          const aborted = new Error('Phira 谱面读取已取消'); aborted.name = 'AbortError'; throw aborted;
        }
        return value;
      } catch (error) {
        if (signal.aborted) throw error;
        const value: import('@/domain/phira').PhiraNoteSnapshot = { chartUpdated: chart!.chartUpdated ?? null, counts: null,
          unavailableReason: '请稍后重试', source: phiraSource() };
        return value;
      }
    }, ...OPTIONS,
  });
}
