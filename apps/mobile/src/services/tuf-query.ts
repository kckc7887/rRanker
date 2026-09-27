import type { QueryClient } from '@tanstack/react-query';
import type { TufPlayerSnapshot } from '@/domain/tuf';
import { captureResourceWrites } from './snapshot-cache-utils';
import { cacheFirstLoad } from './cache-first';
import { publishEntityValue } from './game-data-query';
import { loadTufPlayerFresh, makeTufSnapshot, TufCache } from './tuf-cache';
const cache = new TufCache();


export const TUF_QUERY_OPTIONS = { staleTime: 60_000, gcTime: 10 * 60_000 } as const;

export const TUF_SESSION_RESOURCE_QUERY_OPTIONS = {
  staleTime: Infinity,
  gcTime: Infinity,
  refetchOnMount: false,
  refetchOnReconnect: false,
} as const;


/** TUF 玩家实体的规范键：总览数据包与页面读到同一份版本。 */
export function tufPlayerEntityKey(playerId: number) {
  return ['tuf', 'player', playerId, 'profile'] as const;
}


/** 该玩家实体的规范查询选项：页面与总览派生视图共用。 */
export function tufPlayerQueryOptions(queryClient: QueryClient, playerId: number) {
  const queryKey = tufPlayerEntityKey(playerId);
  return {
    queryKey,
    queryFn: async ({ signal }: { signal: AbortSignal }): Promise<TufPlayerSnapshot> => {
      const assertCurrent = captureResourceWrites('adofai', signal, `adofai:tuf:${playerId}`);
      const snapshot = await cacheFirstLoad({
      assertCurrent,
        loadCached: () => cache.loadPlayer(playerId),
        loadFresh: async () => {
          const player = await loadTufPlayerFresh(playerId, signal);
          const fresh = makeTufSnapshot(player);
          if (!signal.aborted) void cache.savePlayer(playerId, fresh, assertCurrent).catch(() => undefined);
          return fresh;
        },
        onFresh: (fresh) => {
          return publishEntityValue(queryClient, queryKey, fresh, assertCurrent);
        },
        signal,
      });
      return snapshot;
    },
    ...TUF_QUERY_OPTIONS,
  };
}