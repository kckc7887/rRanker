import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useBoundedQueries } from '@/hooks/use-bounded-queries';
import { recordRuntimeError } from '@/services/runtime-diagnostics-recorder';
import { useCachedTabActive } from '@/components/CachedTabScreen';
import { majdataProvider } from '@/providers/majdata-provider';
import {
  loadMajdataParsedChart,
  loadMajdataSong,
  loadMajdataSongSnapshot,
  loadMajdataDemoScoresPage,
} from '@/services/majdata-service';
import type { MajdataSong } from '@/domain/majdata';
import { useSession } from '@/state/session-store';
import { queryClient } from '@/state/query-client';
import { invalidateMajdataCatalog } from '@/services/infinite-query-refresh';

const options = { staleTime: Infinity, gcTime: 5 * 60_000, retry: false, refetchOnMount: false } as const;

const majdataSongKey = (id: string) => ['majdata-net', 'song', id] as const;

async function markMajdataSongFallback(id: string): Promise<void> {
  const key = majdataSongKey(id);
  const displayed = queryClient.getQueryData<MajdataSong>(key);
  if (!displayed) return;
  const metadata = (await loadMajdataSongSnapshot(id))?.metadata;
  const fetchedAt = metadata ? Date.parse(metadata.fetchedAt) : Number.NaN;
  queryClient.setQueryData(key, displayed, Number.isFinite(fetchedAt) ? { updatedAt: fetchedAt } : undefined);
}

function loadMajdataSongQuery(id: string, signal: AbortSignal): Promise<MajdataSong> {
  return loadMajdataSong(
    id,
    signal,
    (fresh) => queryClient.setQueryData(majdataSongKey(id), fresh),
    () => { void markMajdataSongFallback(id).catch(error => recordRuntimeError('majdata-cache', error)); },
  );
}

export async function refreshMajdataCatalog(): Promise<void> {
  await invalidateMajdataCatalog();
}
export function useMajdataSongs(sort: string, search: string) {
  const active = useCachedTabActive();
  return useInfiniteQuery({ queryKey: ['majdata-net', 'catalog', sort, search], initialPageParam: 0,
    queryFn: ({ pageParam, signal }) => majdataProvider.getSongs(pageParam, sort, search, signal),
    getNextPageParam: (last, pages) => last.length < 30 ? undefined : pages.length, enabled: active, notifyOnChangeProps: active ? undefined : [], ...options });
}
export function useMajdataSong(id: string, enabled = true) {
  const active = useCachedTabActive();
  return useQuery({ queryKey: majdataSongKey(id), queryFn: ({ signal }) => loadMajdataSongQuery(id, signal), enabled: active && enabled && !!id, notifyOnChangeProps: active ? undefined : [], ...options, staleTime: 0, refetchOnMount: true });
}
export function useMajdataLibrarySongs(ids: string[]) {
  const definitions = useMemo(() => [...new Set(ids)].map(id => ({
    queryKey: majdataSongKey(id), queryFn: ({ signal }: { signal: AbortSignal }) => loadMajdataSongQuery(id, signal),
    ...options, staleTime: 0, refetchOnMount: true,
  })), [ids]);
  return useBoundedQueries(definitions, 4).queries;
}
export function useMajdataParsedChart(song: MajdataSong | undefined, level: number) {
  const active = useCachedTabActive();
  return useQuery({ queryKey: ['majdata-net', 'parsed', song?.id, song?.hash, level], queryFn: ({ signal }) => loadMajdataParsedChart(song!, level, signal), enabled: active && !!song, notifyOnChangeProps: active ? undefined : [], ...options });
}
export function useMajdataRanking(id: string, enabled: boolean) {
  const active = useCachedTabActive(); const accountId = useSession(s => s.activeAccountId);
  const providerId = useSession(s => s.activeProviderId);
  return useQuery({ queryKey: ['majdata-net', 'ranking', accountId, id], queryFn: ({ signal }) => majdataProvider.getRanking(id, signal), enabled: enabled && active && providerId !== 'majdata-net-test', notifyOnChangeProps: active ? undefined : [], ...options });
}

export function useMajdataDemoScores() {
  const active = useCachedTabActive();
  const accountId = useSession(s => s.activeAccountId);
  const providerId = useSession(s => s.activeProviderId);
  const bound = providerId === 'majdata-net-test';
  const query = useInfiniteQuery({
    queryKey: ['majdata-net', 'demo-scores', accountId], initialPageParam: 0,
    queryFn: ({ pageParam, signal }) => loadMajdataDemoScoresPage(pageParam, signal),
    getNextPageParam: (last, pages) => last.songCount < 30 ? undefined : pages.length,
    enabled: active && bound, notifyOnChangeProps: active ? undefined : [], ...options,
  });
  const records = useMemo(() => {
    const seen = new Set<string>();
    return (query.data?.pages.flatMap(page => page.records) ?? []).filter(record => {
      const key = `${record.chartInfo.id}:${record.chartLevel}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [query.data?.pages]);
  return { ...query, bound, records };
}
