import { useInfiniteQuery, useQueries, useQuery } from '@tanstack/react-query';
import { useCachedTabActive } from '@/components/CachedTabScreen';
import { majdataProvider } from '@/providers/majdata-provider';
import { loadMajdataChart, loadMajdataSong, loadMajdataParsedChart } from '@/services/majdata-service';
import type { MajdataSong } from '@/domain/majdata';
import { useSession } from '@/state/session-store';
import { queryClient } from '@/state/query-client';

const options = { staleTime: Infinity, gcTime: Infinity, retry: false, refetchOnMount: false } as const;
export function useMajdataSongs(sort: string, search: string) {
  const active = useCachedTabActive();
  return useInfiniteQuery({ queryKey: ['majdata-net', 'catalog', sort, search], initialPageParam: 0,
    queryFn: ({ pageParam, signal }) => majdataProvider.getSongs(pageParam, sort, search, signal),
    getNextPageParam: (last, pages) => last.length < 30 ? undefined : pages.length, enabled: active, ...options });
}
export function useMajdataSong(id: string, enabled = true) {
  return useQuery({ queryKey: ['majdata-net', 'song', id], queryFn: ({ signal }) => loadMajdataSong(id, signal, song => queryClient.setQueryData(['majdata-net', 'song', id], song)), enabled: enabled && !!id, ...options, staleTime: 0, refetchOnMount: true });
}
export function useMajdataLibrarySongs(ids: string[]) {
  return useQueries({ queries: ids.map(id => ({ queryKey: ['majdata-net', 'song', id], queryFn: ({ signal }: { signal: AbortSignal }) => loadMajdataSong(id, signal, song => queryClient.setQueryData(['majdata-net', 'song', id], song)), ...options, staleTime: 0, refetchOnMount: true })) });
}
export function useMajdataChart(song?: MajdataSong) {
  return useQuery({ queryKey: ['majdata-net', 'chart', song?.id, song?.hash], queryFn: ({ signal }) => loadMajdataChart(song!, signal), enabled: !!song, ...options });
}
export function useMajdataParsedChart(song: MajdataSong | undefined, level: number) {
  return useQuery({ queryKey: ['majdata-net', 'parsed', song?.id, song?.hash, level], queryFn: ({ signal }) => loadMajdataParsedChart(song!, level, signal), enabled: !!song, ...options });
}
export function useMajdataRanking(id: string, enabled: boolean) {
  const active = useCachedTabActive(); const accountId = useSession(s => s.activeAccountId);
  return useQuery({ queryKey: ['majdata-net', 'ranking', accountId, id], queryFn: ({ signal }) => majdataProvider.getRanking(id, signal), enabled: enabled && active, ...options });
}
