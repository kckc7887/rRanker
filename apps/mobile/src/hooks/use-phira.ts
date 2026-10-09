import { PHIRA_QUERY_OPTIONS, phiraBestsEntityKey, phiraPlayerQueryOptions } from '@/services/phira-query';
import { captureResourceWrites } from '@/services/snapshot-cache-utils';
import { useEffect, useMemo, useRef } from 'react';
import { getForegroundAbortSignal } from '@/state/app-lifecycle';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { PhiraChart, PhiraChartPage, PhiraChartStatus } from '@/domain/phira';
import { phiraProvider } from '@/providers/phira-provider';

import { countPhiraChartZip } from '@/services/phira-chart-notes';
import { CHART_PREVIEW_MAX_DOWNLOAD_BYTES } from '@/features/chart-preview-shared/chart-preview-resource-budget';
import { phiraCache, phiraSource } from '@/services/phira-cache';
import { phiraCatalogNextPage } from '@/domain/phira-filters';
import { loadPhiraPlayerFresh, queryPhiraChartBest, refreshAllPhiraBests, refreshPhiraBestTargets, type PhiraBestRefreshResult, type PhiraBestRefreshStatus, type PhiraBestRefreshTarget } from '@/services/phira-service';
import { publishEntityValue } from '@/services/game-data-query';
import { queryClient } from '@/state/query-client';
import { useCachedTabActive } from '@/components/CachedTabScreen';

export function usePhiraPlayerSearch(value: string) {
  const query = value.trim();
  const numericId = /^\d+$/.test(query) ? Number(query) : null;
  return useQuery({
    queryKey: ['phira', 'players', query], enabled: query.length > 0,
    queryFn: async ({ signal }) => numericId ? [await phiraProvider.getUser(numericId, signal)] : phiraProvider.searchUsers(query, signal),
    ...PHIRA_QUERY_OPTIONS,
  });
}

export function usePhiraPlayer(playerId: number | null, enabled = true) {
  const tabActive = useCachedTabActive();
  const fallbackId = playerId ?? 0;
  return useQuery({
    ...phiraPlayerQueryOptions(queryClient, fallbackId),
    enabled: enabled && tabActive && playerId !== null,
    notifyOnChangeProps: tabActive ? undefined : [],
  });
}

export function usePhiraBests(playerId: number | null, enabled = true) {
  const tabActive = useCachedTabActive();
  return useQuery({
    queryKey: phiraBestsEntityKey(playerId ?? 0), enabled: enabled && tabActive && playerId !== null,
    notifyOnChangeProps: tabActive ? undefined : [],
    queryFn: () => phiraCache.loadBests(playerId!), ...PHIRA_QUERY_OPTIONS,
  });
}

export type PhiraBestRefreshOutcome = {
  status: PhiraBestRefreshStatus | 'cancelled';
  requestedCount: number;
  updatedCount: number;
  failedChartIds: number[];
};

const refreshOutcome = (status: PhiraBestRefreshOutcome['status']): PhiraBestRefreshOutcome =>
  ({ status, requestedCount: 0, updatedCount: 0, failedChartIds: [] });

const outcomeFrom = (result: PhiraBestRefreshResult): PhiraBestRefreshOutcome => ({
  status: result.refresh.status,
  requestedCount: result.refresh.requestedChartIds.length,
  updatedCount: result.refresh.updatedChartIds.length,
  failedChartIds: result.refresh.failures.map((failure) => failure.chartId),
});

export function useRefreshAllPhiraBests(playerId: number | null) {
  const lifetime = useRef(new AbortController());
  const failedTargets = useRef<readonly PhiraBestRefreshTarget[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    return () => controller.abort();
  }, [playerId]);
  const runRefresh = async (
    run: (signal: AbortSignal, assertCurrent: () => void) => Promise<PhiraBestRefreshResult>,
  ): Promise<PhiraBestRefreshOutcome> => {
    if (playerId === null) return refreshOutcome('noop');
    const controller = new AbortController();
    const foreground = getForegroundAbortSignal();
    const cancel = () => controller.abort();
    const signals = [foreground, lifetime.current.signal];
    signals.forEach((signal) => signal.addEventListener('abort', cancel, { once: true }));
    if (signals.some((signal) => signal.aborted)) cancel();
    const assertCurrent = captureResourceWrites('phira', controller.signal, `phira:community:${playerId}`);
    try {
      assertCurrent();
      const result = await run(controller.signal, assertCurrent);
      assertCurrent();
      if (result.snapshot) publishEntityValue(queryClient, phiraBestsEntityKey(playerId), result.snapshot);
      failedTargets.current = result.refresh.failures.map((failure) => failure.target);
      return outcomeFrom(result);
    } catch (error) {
      if (controller.signal.aborted) return refreshOutcome('cancelled');
      throw error;
    } finally {
      signals.forEach((signal) => signal.removeEventListener('abort', cancel));
    }
  };
  const refreshAll = () => runRefresh(async (signal, assertCurrent) => {
    await loadPhiraPlayerFresh(playerId!, signal);
    assertCurrent();
    return refreshAllPhiraBests(playerId!, signal);
  });
  const retryFailed = () => {
    const targets = failedTargets.current;
    if (playerId === null || targets.length === 0) return Promise.resolve(refreshOutcome('noop'));
    return runRefresh((signal) => refreshPhiraBestTargets(playerId, targets, signal));
  };
  return { refreshAll, retryFailed };
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
    /** Phira 的 page=1 与首页相同，翻页顺序为 0、2、3… */
    getNextPageParam: (last, pages) => phiraCatalogNextPage(pages, last),
    enabled: enabled && tabActive,
    notifyOnChangeProps: tabActive ? undefined : [],
    ...PHIRA_QUERY_OPTIONS,
  });
}

export function usePhiraChartsByIds(ids: readonly number[]) {
  const sorted = useMemo(() => [...new Set(ids)].sort((a, b) => a - b), [ids]);
  return useQuery({
    queryKey: ['phira', 'charts-by-ids', sorted], enabled: sorted.length > 0,
    queryFn: ({ signal }) => phiraProvider.getChartsByIds(sorted, signal),
    ...PHIRA_QUERY_OPTIONS,
  });
}

export function usePhiraChart(chartId: number | null) {
  const active = useCachedTabActive();
  return useQuery({
    queryKey: ['phira', 'chart', chartId], enabled: active && chartId !== null,
    notifyOnChangeProps: active ? undefined : [],
    queryFn: ({ signal }): Promise<PhiraChart> => phiraProvider.getChart(chartId!, signal), ...PHIRA_QUERY_OPTIONS,
  });
}

export function usePhiraChartBest(playerId: number | null, chart: PhiraChart | undefined) {
  const active = useCachedTabActive();
  return useQuery({
    queryKey: ['phira', 'best', playerId, chart?.id], enabled: active && playerId !== null && !!chart,
    notifyOnChangeProps: active ? undefined : [],
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
    }, ...PHIRA_QUERY_OPTIONS,
  });
}

export function usePhiraUploader(userId: number | null) {
  const active = useCachedTabActive();
  return useQuery({ queryKey: ['phira', 'uploader', userId], enabled: active && userId !== null,
    notifyOnChangeProps: active ? undefined : [],
    queryFn: ({ signal }) => phiraProvider.getUploader(userId!, signal), ...PHIRA_QUERY_OPTIONS });
}

export function usePhiraNotes(chart: PhiraChart | undefined, enabled = true) {
  const active = useCachedTabActive();
  return useQuery({
    queryKey: ['phira', 'notes', chart?.id, chart?.chartUpdated], enabled: active && enabled && !!chart?.file,
    notifyOnChangeProps: active ? undefined : [],
    queryFn: async ({ signal }) => {
      try {
        const data = await phiraProvider.downloadChart(chart!.file!, signal, CHART_PREVIEW_MAX_DOWNLOAD_BYTES);
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
    }, ...PHIRA_QUERY_OPTIONS,
  });
}
