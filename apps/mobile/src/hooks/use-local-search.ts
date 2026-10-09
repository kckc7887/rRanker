import { useEffect, useState } from 'react';
import { useCachedTabActive } from '@/components/CachedTabScreen';
import { scheduleIdleTask, useAppLifecycle } from '@/state/app-lifecycle';

const EMPTY_RESULTS: never[] = [];

export function useLocalSearch<T, F, R>(
  items: readonly T[] | undefined,
  filter: F,
  select: (item: T, filter: F) => R | undefined,
  snapshot: unknown = items,
) {
  const active = useCachedTabActive();
  const { foregroundReady } = useAppLifecycle();
  const [result, setResult] = useState<{
    items: readonly T[] | undefined; snapshot: unknown; filter: F;
    select: typeof select; data: R[];
  }>();

  useEffect(() => {
    if (!active || !foregroundReady) return;
    if (result && result.items === items && result.snapshot === snapshot
      && result.filter === filter && result.select === select) return;
    let cancelled = false;
    let offset = 0;
    const data: R[] = [];
    let cancelIdle: () => void;
    const run = () => {
      const started = performance.now();
      while (items && offset < items.length) {
        const match = select(items[offset++], filter);
        if (match !== undefined) data.push(match);
        if (performance.now() - started >= 4) break;
      }
      if (cancelled) return;
      if (items && offset < items.length) cancelIdle = scheduleIdleTask(run);
      else setResult({ items, snapshot, filter, select, data });
    };
    cancelIdle = scheduleIdleTask(run);
    return () => { cancelled = true; cancelIdle(); };
  }, [active, filter, foregroundReady, items, result, select, snapshot]);

  const current = result?.items === items && result?.snapshot === snapshot ? result : undefined;
  return {
    data: current?.data ?? EMPTY_RESULTS as R[],
    filter: current?.filter ?? filter,
    isFiltering: !current || current.filter !== filter || current.select !== select,
  };
}
