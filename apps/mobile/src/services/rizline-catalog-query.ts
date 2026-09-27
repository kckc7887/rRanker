import type { QueryClient } from '@tanstack/react-query';
import { publishEntityValue } from './game-data-query';
import { captureResourceWrites } from './snapshot-cache-utils';
import { rizlineResources } from './rizline-resources';
import type { RizlineCatalogData } from '@/domain/rizline';
import { rizlinePayloadFromSnapshot, type GameDataBundle } from '@/domain/game-data';


export const RIZLINE_CATALOG_QUERY_KEY = ['rizline', 'catalog'] as const;

export const RIZLINE_CATALOG_QUERY_OPTIONS = { staleTime: Infinity, gcTime: Infinity, retry: false, refetchOnMount: false, refetchOnReconnect: false } as const;

export function applyRizlineCatalog(queryClient: QueryClient, data: RizlineCatalogData, assertCurrent?: () => void): Promise<void> {
  return publishEntityValue(queryClient, RIZLINE_CATALOG_QUERY_KEY, data, assertCurrent).then(() => {
  try { assertCurrent?.(); } catch { return; }
  // Metadata can arrive after the account cache. Recompute only derived fields, preserving official scores.
  // 身份与载荷一起收窄：数据包是「按游戏配对」的联合，只看 payload.kind 无法把它写回同一份数据包。
  queryClient.setQueriesData<GameDataBundle>({ predicate: query => query.queryKey[0] === 'game-data' && query.queryKey[3] === 'rizline' }, old =>
    old?.gameId === 'rizline' && old.payload.kind === 'rizline'
      ? { ...old, payload: rizlinePayloadFromSnapshot(old.payload.snapshot, data) }
      : old);
  });
}

export function ensureRizlineCatalog(queryClient: QueryClient): Promise<RizlineCatalogData> {
  return queryClient.fetchQuery({ queryKey: RIZLINE_CATALOG_QUERY_KEY, ...RIZLINE_CATALOG_QUERY_OPTIONS, queryFn: ({ signal }) => rizlineResources.load(signal, data => applyRizlineCatalog(queryClient, data, captureResourceWrites('rizline', signal))) });
}

export async function refreshRizlineCatalog(queryClient: QueryClient): Promise<RizlineCatalogData> {
  await queryClient.cancelQueries({ queryKey: RIZLINE_CATALOG_QUERY_KEY });
  await queryClient.invalidateQueries({ queryKey: RIZLINE_CATALOG_QUERY_KEY, refetchType: 'none' });
  return queryClient.fetchQuery({ queryKey: RIZLINE_CATALOG_QUERY_KEY, ...RIZLINE_CATALOG_QUERY_OPTIONS, queryFn: async ({ signal }) => {
    const data = await rizlineResources.loadFresh(signal);
    if (!signal.aborted) void applyRizlineCatalog(queryClient, data, captureResourceWrites('rizline', signal));
    return data;
  } });
}