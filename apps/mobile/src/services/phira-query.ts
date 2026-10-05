import type { QueryClient } from '@tanstack/react-query';
import type { PhiraPlayerSnapshot } from '@/domain/phira';
import { captureResourceWrites } from './snapshot-cache-utils';
import { cacheFirstLoad } from './cache-first';
import { phiraCache } from './phira-cache';
import { loadPhiraPlayerFresh, refreshPhiraSeedBests } from './phira-service';
import { publishEntityValue } from './game-data-query';


export const PHIRA_QUERY_OPTIONS = { staleTime: 60_000, gcTime: 10 * 60_000 } as const;


export function phiraPlayerEntityKey(playerId: number) {
  return ['phira', 'player', playerId] as const;
}


export function phiraBestsEntityKey(playerId: number) {
  return ['phira', 'bests', playerId] as const;
}


export function phiraPlayerQueryOptions(queryClient: QueryClient, playerId: number) {
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
            if (!signal.aborted && result.snapshot) {
              publishEntityValue(queryClient, phiraBestsEntityKey(playerId), result.snapshot);
            }
          })
          .catch(() => undefined);
        return fresh;
      },
      onFresh: (fresh) => publishEntityValue(queryClient, queryKey, fresh, captureResourceWrites('phira', signal, `phira:community:${playerId}`)),
      signal,
    }),
    ...PHIRA_QUERY_OPTIONS,
  };
}
