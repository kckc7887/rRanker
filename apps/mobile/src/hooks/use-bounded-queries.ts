import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueries, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import { useCachedTabActive } from '@/components/CachedTabScreen';
import { getForegroundAbortSignal, useAppLifecycle } from '@/state/app-lifecycle';
import { createBoundedLoadQueue, loadItemsBounded } from '@/services/offset-pagination';

/** 逐项保留查询键，只订阅已领取条目；加载和重试共用一条有界执行队列。 */
export function useBoundedQueries<T>(
  options: readonly UseQueryOptions<T>[],
  concurrency: number,
  enabled = true,
  retryFailedOnMount = true,
) {
  const client = useQueryClient();
  const active = useCachedTabActive();
  const { foregroundReady, foregroundGeneration } = useAppLifecycle();
  const execute = useMemo(() => createBoundedLoadQueue(concurrency), [concurrency]);
  const definitions = useMemo<UseQueryOptions<T>[]>(() => options.map(option => {
    const load = option.queryFn;
    if (typeof load !== 'function') return option;
    const queryFn: typeof load = context => execute(() => {
      if (context.signal.aborted) throw context.signal.reason ?? new Error('操作已取消');
      return Promise.resolve(load(context));
    });
    return { ...option, queryFn };
  }), [execute, options]);
  const [claimed, setClaimed] = useState({ options, count: 0 });
  const lifetime = useRef<AbortController | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const claimedCount = claimed.options === options ? claimed.count : 0;
  const queries = useQueries({ queries: enabled ? definitions.slice(0, claimedCount).map(option => ({
    ...option, enabled: active && foregroundReady ? option.enabled ?? true : false,
    refetchOnMount: false, retryOnMount: false,
    notifyOnChangeProps: active && foregroundReady ? option.notifyOnChangeProps : [],
  })) : [] });

  const enqueue = useCallback((controller: AbortController, failedOnly: boolean) => {
    const items = definitions.map((option, index) => ({ option, index })).filter(({ option }) => {
      const failed = client.getQueryState(option.queryKey)?.status === 'error';
      return !failedOnly || failed;
    });
    const run = async () => {
      await loadItemsBounded({ items, concurrency, signal: controller.signal, load: async ({ option, index }) => {
        setClaimed(current => current.options === options && current.count > index
          ? current : { options, count: Math.max(current.options === options ? current.count : 0, index + 1) });
        const state = client.getQueryState(option.queryKey);
        if (!failedOnly && !retryFailedOnMount && state?.status === 'error') throw state.error;
        if (failedOnly && state?.status !== 'error') return state?.data;
        return client.fetchQuery(option);
      } });
    };
    queue.current = queue.current.then(run, run);
  }, [client, concurrency, definitions, options, retryFailedOnMount]);

  useEffect(() => {
    if (!enabled || !active || !foregroundReady || options.length === 0) return;
    const controller = new AbortController();
    const foreground = getForegroundAbortSignal();
    const cancel = () => controller.abort();
    lifetime.current = controller;
    foreground.addEventListener('abort', cancel, { once: true });
    if (foreground.aborted) cancel();
    enqueue(controller, false);
    return () => {
      controller.abort();
      foreground.removeEventListener('abort', cancel);
      if (lifetime.current === controller) lifetime.current = null;
    };
  }, [active, enabled, enqueue, foregroundGeneration, foregroundReady, options.length]);

  const retryFailed = useCallback(() => {
    const controller = lifetime.current;
    if (controller && !controller.signal.aborted) enqueue(controller, true);
  }, [enqueue]);
  return { queries, retryFailed };
}
