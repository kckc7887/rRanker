import { useQuery } from '@tanstack/react-query';
import { useCachedTabActive } from '@/components/CachedTabScreen';
import { rizlineResources } from '@/services/rizline-resources';
import type { RizlineCatalogData } from '@/domain/rizline';
import { rizlinePayloadFromSnapshot, type GameDataBundle } from '@/domain/game-data';
import { queryClient } from '@/state/query-client';

export const RIZLINE_CATALOG_QUERY_KEY = ['rizline', 'catalog'] as const;
const options = { staleTime: Infinity, gcTime: Infinity, retry: false, refetchOnMount: false, refetchOnReconnect: false } as const;
function applyCatalog(data: RizlineCatalogData): void {
  queryClient.setQueryData(RIZLINE_CATALOG_QUERY_KEY, data);
  // Metadata can arrive after the account cache. Recompute only derived fields, preserving official scores.
  queryClient.setQueriesData<GameDataBundle>({ predicate: query => query.queryKey[0] === 'game-data' && query.queryKey[3] === 'rizline' }, old =>
    old?.payload.kind === 'rizline' ? { ...old, payload: rizlinePayloadFromSnapshot(old.payload.snapshot, data) } : old);
}
export function useRizlineCatalog(enabled = true) {
  const active = useCachedTabActive();
  return useQuery({ queryKey: RIZLINE_CATALOG_QUERY_KEY, ...options, enabled: enabled && active,
    queryFn: ({ signal }) => rizlineResources.load(signal, applyCatalog) });
}
export function ensureRizlineCatalog(): Promise<RizlineCatalogData> {
  return queryClient.fetchQuery({ queryKey: RIZLINE_CATALOG_QUERY_KEY, ...options, queryFn: ({ signal }) => rizlineResources.load(signal, applyCatalog) });
}
export async function refreshRizlineCatalog(): Promise<RizlineCatalogData> {
  await queryClient.cancelQueries({ queryKey: RIZLINE_CATALOG_QUERY_KEY });
  await queryClient.invalidateQueries({ queryKey: RIZLINE_CATALOG_QUERY_KEY, refetchType: 'none' });
  return queryClient.fetchQuery({ queryKey: RIZLINE_CATALOG_QUERY_KEY, ...options, queryFn: async ({ signal }) => {
    const data = await rizlineResources.loadFresh(signal);
    if (!signal.aborted) applyCatalog(data);
    return data;
  } });
}
