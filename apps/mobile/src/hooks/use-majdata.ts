import { useInfiniteQuery, useQueries, useQuery } from '@tanstack/react-query';
import { useCachedTabActive } from '@/components/CachedTabScreen';
import { majdataProvider } from '@/providers/majdata-provider';
import {
  loadMajdataChart,
  loadMajdataParsedChart,
  loadMajdataSong,
  loadMajdataSongSnapshot,
} from '@/services/majdata-service';
import type { MajdataSong } from '@/domain/majdata';
import { useSession } from '@/state/session-store';
import { queryClient } from '@/state/query-client';
import { invalidateMajdataCatalog } from '@/services/infinite-query-refresh';

const options = { staleTime: Infinity, gcTime: Infinity, retry: false, refetchOnMount: false } as const;

const majdataSongKey = (id: string) => ['majdata-net', 'song', id] as const;

/**
 * 缓存回退的落点：把落盘快照的抓取时间写回查询缓存。
 *
 * 回退数据不是本次刷新结果，读快照元数据而不是取当前时间，回退因此不会表现为刚刚抓取成功；
 * 没有元数据（旧版本行）时保持原时间标记不变。
 */
async function markMajdataSongFallback(id: string): Promise<void> {
  const key = majdataSongKey(id);
  const displayed = queryClient.getQueryData<MajdataSong>(key);
  if (!displayed) return;
  const metadata = (await loadMajdataSongSnapshot(id))?.metadata;
  const fetchedAt = metadata ? Date.parse(metadata.fetchedAt) : Number.NaN;
  queryClient.setQueryData(key, displayed, Number.isFinite(fetchedAt) ? { updatedAt: fetchedAt } : undefined);
}

/**
 * 曲目查询的公共取数函数：本地快照先渲染，后台刷新成功才写回查询缓存。
 * 缓存回退走 onFallback，不进入 onFresh，也不冒充本次抓取。
 */
function loadMajdataSongQuery(id: string, signal: AbortSignal): Promise<MajdataSong> {
  return loadMajdataSong(
    id,
    signal,
    (fresh) => queryClient.setQueryData(majdataSongKey(id), fresh),
    () => { void markMajdataSongFallback(id); },
  );
}

export async function refreshMajdataCatalog(): Promise<void> {
  await invalidateMajdataCatalog();
}
export function useMajdataSongs(sort: string, search: string) {
  const active = useCachedTabActive();
  return useInfiniteQuery({ queryKey: ['majdata-net', 'catalog', sort, search], initialPageParam: 0,
    queryFn: ({ pageParam, signal }) => majdataProvider.getSongs(pageParam, sort, search, signal),
    getNextPageParam: (last, pages) => last.length < 30 ? undefined : pages.length, enabled: active, ...options });
}
export function useMajdataSong(id: string, enabled = true) {
  return useQuery({ queryKey: majdataSongKey(id), queryFn: ({ signal }) => loadMajdataSongQuery(id, signal), enabled: enabled && !!id, ...options, staleTime: 0, refetchOnMount: true });
}
export function useMajdataLibrarySongs(ids: string[]) {
  return useQueries({ queries: ids.map(id => ({ queryKey: majdataSongKey(id), queryFn: ({ signal }: { signal: AbortSignal }) => loadMajdataSongQuery(id, signal), ...options, staleTime: 0, refetchOnMount: true })) });
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
