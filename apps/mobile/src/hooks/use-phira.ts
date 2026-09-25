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
  loadPhiraPlayerFresh, queryPhiraChartBest, refreshAllPhiraBests, refreshPhiraBestTargets,
  refreshPhiraSeedBests, type PhiraBestRefreshResult, type PhiraBestRefreshStatus, type PhiraBestRefreshTarget,
} from '@/services/phira-service';
import { publishEntityValue } from '@/services/game-data-query';
import { queryClient } from '@/state/query-client';
import { useCachedTabActive } from '@/components/CachedTabScreen';

const OPTIONS = { staleTime: 60_000, gcTime: 10 * 60_000 } as const;

/** Phira 玩家实体的规范键：总览数据包与页面读到同一份版本。 */
export function phiraPlayerEntityKey(playerId: number) {
  return ['phira', 'player', playerId] as const;
}

/** 已查询谱面最佳成绩的规范键（与玩家实体不同粒度，因此保留独立 key）。 */
export function phiraBestsEntityKey(playerId: number) {
  return ['phira', 'bests', playerId] as const;
}

/** 该玩家实体的规范查询选项：页面与总览派生视图共用。 */
export function phiraPlayerQueryOptions(playerId: number) {
  const queryKey = phiraPlayerEntityKey(playerId);
  return {
    queryKey,
    queryFn: async ({ signal }: { signal: AbortSignal }): Promise<PhiraPlayerSnapshot> => cacheFirstLoad({
      assertCurrent: captureResourceWrites('phira', signal, `phira:community:${playerId}`),
      loadCached: () => phiraCache.loadPlayer(playerId),
      loadFresh: async () => {
        const assertCurrent = captureResourceWrites('phira', signal, `phira:community:${playerId}`);
        const fresh = await loadPhiraPlayerFresh(playerId, signal);
        assertCurrent();
        void refreshPhiraSeedBests(fresh, signal)
          .then((result) => {
            assertCurrent();
            // 只把缓存快照写进 bests 查询；后台补全不消费本次操作摘要。
            if (!signal.aborted && result.snapshot) {
              publishEntityValue(queryClient, phiraBestsEntityKey(playerId), result.snapshot);
            }
          })
          .catch(() => undefined);
        return fresh;
      },
      onFresh: (fresh) => publishEntityValue(queryClient, queryKey, fresh),
      signal,
    }),
    ...OPTIONS,
  };
}

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
  const fallbackId = playerId ?? 0;
  return useQuery({
    ...phiraPlayerQueryOptions(fallbackId),
    enabled: enabled && tabActive && playerId !== null,
  });
}

export function usePhiraBests(playerId: number | null, enabled = true) {
  const tabActive = useCachedTabActive();
  return useQuery({
    queryKey: phiraBestsEntityKey(playerId ?? 0), enabled: enabled && tabActive && playerId !== null,
    queryFn: () => phiraCache.loadBests(playerId!), ...OPTIONS,
  });
}

/**
 * 页面可见的一次刷新结果：service 摘要加上 Hook 自己管理的取消语义。
 * `success` / `partial` / `failed` / `noop` 由 service 判定，`cancelled` 表示本次操作在完成前被取消。
 */
export type PhiraBestRefreshOutcome = {
  status: PhiraBestRefreshStatus | 'cancelled';
  /** 本次请求覆盖的谱面数；取消除外。 */
  requestedCount: number;
  updatedCount: number;
  /** 失败项谱面 id；页面据此显示失败数量并提供重试。 */
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

/**
 * 主动刷新当前玩家已查询谱面的最佳成绩。
 * 操作摘要由每次调用的返回值交给页面（页面自有通知入口），bests 查询只承载缓存快照，
 * 普通缓存重新加载不承担保存操作结果的职责。
 */
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
