import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { PhiraChart, PhiraChartPage, PhiraChartStatus, PhiraPlayerSnapshot } from '@/domain/phira';
import { phiraProvider } from '@/providers/phira-provider';
import { cacheFirstLoad } from '@/services/cache-first';
import { countPhiraChartZip } from '@/services/phira-chart-notes';
import { phiraCache, phiraSource } from '@/services/phira-cache';
import {
  loadPhiraPlayerFresh, queryPhiraChartBest, refreshAllPhiraBests, refreshPhiraSeedBests,
} from '@/services/phira-service';
import { queryClient } from '@/state/query-client';

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

export function usePhiraPlayer(playerId: number | null) {
  const key = ['phira', 'player', playerId] as const;
  return useQuery({
    queryKey: key, enabled: playerId !== null,
    queryFn: async ({ signal }): Promise<PhiraPlayerSnapshot> => cacheFirstLoad({
      loadCached: () => phiraCache.loadPlayer(playerId!),
      loadFresh: async () => {
        const fresh = await loadPhiraPlayerFresh(playerId!, signal);
        void refreshPhiraSeedBests(fresh, signal)
          .then((bests) => queryClient.setQueryData(['phira', 'bests', playerId], bests))
          .catch(() => undefined);
        return fresh;
      },
      onFresh: (fresh) => queryClient.setQueryData(key, fresh),
    }),
    ...OPTIONS,
  });
}

export function usePhiraBests(playerId: number | null) {
  return useQuery({
    queryKey: ['phira', 'bests', playerId], enabled: playerId !== null,
    queryFn: () => phiraCache.loadBests(playerId!), ...OPTIONS,
  });
}

export function useRefreshAllPhiraBests(playerId: number | null) {
  return () => playerId === null ? Promise.resolve(null) : loadPhiraPlayerFresh(playerId)
    .then(() => refreshAllPhiraBests(playerId)).then((value) => {
    queryClient.setQueryData(['phira', 'bests', playerId], value); return value;
  });
}

export function usePhiraCharts(status: PhiraChartStatus, search: string) {
  const normalized = search.trim();
  return useInfiniteQuery({
    queryKey: ['phira', 'charts', status, normalized], initialPageParam: 0,
    queryFn: async ({ pageParam, signal }): Promise<PhiraChartPage> => {
      const snapshot = await cacheFirstLoad({
        loadCached: () => phiraCache.loadPage(status, pageParam, normalized),
        loadFresh: async () => {
          const data = await phiraProvider.getCharts({ status, page: pageParam, search: normalized || undefined }, signal);
          const fresh = { data, source: phiraSource() };
          void phiraCache.savePage(status, pageParam, normalized, fresh); return fresh;
        },
        onFresh: () => undefined,
      });
      return snapshot.data;
    },
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((sum, page) => sum + page.results.length, 0);
      if (last.total !== undefined) return loaded < last.total ? pages.length : undefined;
      return last.results.length >= 30 ? pages.length : undefined;
    },
    ...OPTIONS,
  });
}

export function usePhiraChart(chartId: number | null) {
  return useQuery({
    queryKey: ['phira', 'chart', chartId], enabled: chartId !== null,
    queryFn: async ({ signal }): Promise<PhiraChart> => {
      const snapshot = await cacheFirstLoad({
        loadCached: () => phiraCache.loadChart(chartId!),
        loadFresh: async () => {
          const chart = await phiraProvider.getChart(chartId!, signal);
          const fresh = { chart, source: phiraSource() }; void phiraCache.saveChart(chartId!, fresh); return fresh;
        },
        onFresh: () => undefined,
      });
      return snapshot.chart;
    }, ...OPTIONS,
  });
}

export function usePhiraChartBest(playerId: number | null, chart: PhiraChart | undefined) {
  return useQuery({
    queryKey: ['phira', 'best', playerId, chart?.id], enabled: playerId !== null && !!chart,
    queryFn: async ({ signal }) => {
      const cached = await phiraCache.loadBests(playerId!);
      const existing = cached?.items[String(chart!.id)];
      if (existing) return existing;
      const player = await phiraCache.loadPlayer(playerId!);
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
      const cached = await phiraCache.loadNotes(chart!.id);
      if (cached && cached.chartUpdated === (chart!.chartUpdated ?? null)) return cached;
      try {
        const data = await phiraProvider.downloadChart(chart!.file!, signal);
        const value: import('@/domain/phira').PhiraNoteSnapshot = { chartUpdated: chart!.chartUpdated ?? null, counts: await countPhiraChartZip(data, signal), source: phiraSource() };
        if (signal.aborted) {
          const aborted = new Error('Phira 谱面读取已取消'); aborted.name = 'AbortError'; throw aborted;
        }
        await phiraCache.saveNotes(chart!.id, value); return value;
      } catch (error) {
        if (signal.aborted) throw error;
        const value: import('@/domain/phira').PhiraNoteSnapshot = { chartUpdated: chart!.chartUpdated ?? null, counts: null,
          unavailableReason: error instanceof Error ? error.message : '谱面不可用', source: phiraSource() };
        await phiraCache.saveNotes(chart!.id, value); return value;
      }
    }, ...OPTIONS,
  });
}
