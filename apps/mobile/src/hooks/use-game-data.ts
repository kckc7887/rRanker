import { captureResourceWrites } from '@/services/snapshot-cache-utils';
import { useQuery } from '@tanstack/react-query';
import type { GameDataBundle } from '@/domain/game-data';
import { getGameProfile } from '@/domain/game-profile';
import { queryClient } from '@/state/query-client';
import { useSession } from '@/state/session-store';
import { gameDataQueryKey } from '@/services/game-data-query';
import { useCachedTabActive } from '@/components/CachedTabScreen';
import { loadGameDataBundle } from '@/hooks/game-data-loaders';

export function useGameData(enabled = true) {
  const tabActive = useCachedTabActive();
  const session = useSession((s) => s.session);
  const activeGameId = useSession((s) => s.activeGameId);
  const activeProviderId = useSession((s) => s.activeProviderId);
  const activeAccountId = useSession((s) => s.activeAccountId);
  const activeAccount = useSession((s) => (
    s.boundAccounts.find((account) => account.id === s.activeAccountId)
  ));
  const scoreProvider = useSession((s) => s.scoreProvider);
  const catalogProvider = useSession((s) => s.catalogProvider);
  const profile = getGameProfile(activeGameId);

  const queryKey = gameDataQueryKey(
    activeAccountId,
    activeGameId,
    activeProviderId,
    session?.mode ?? null,
  );

  const query = useQuery({
    queryKey,
    enabled: enabled && tabActive,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnMount: false,
    refetchOnReconnect: false,
    queryFn: async ({ signal }): Promise<GameDataBundle> => {
      const assertCurrent = captureResourceWrites(activeGameId, signal, activeAccountId);
      const hasSessionData = queryClient.getQueryData<GameDataBundle>(queryKey) !== undefined;
      return loadGameDataBundle({
        activeGameId,
        activeProviderId,
        activeAccountId,
        session,
        scoreProvider,
        catalogProvider,
        activeAccount,
        profile,
        queryKey,
        hasSessionData,
        signal,
        assertCurrent,
      });
    },
  });

  return {
    ...query,
    profile,
    activeGameId,
    activeProviderId,
    activeAccountId,
    isDataStale: !!query.data?.payload && (
      query.data.payload.kind === 'rizline'
        ? query.data.payload.source.isStale || query.data.payload.catalogSource?.isStale === true
        : query.data.payload.kind === 'chunithm'
        ? query.data.payload.source.isStale
        : query.data.payload.kind === 'adofai'
          ? query.data.payload.source.isStale
          : query.data.payload.kind === 'musedash'
            ? query.data.payload.source.isStale
          : query.data.payload.kind === 'majdata-net'
            ? query.data.payload.source.isStale
          : query.data.payload.kind === 'phira'
            ? query.data.payload.source.isStale
          : query.data.payload.kind === 'osu'
            ? query.data.payload.source.isStale
        : (query.data.payload.kind === 'maimai' || query.data.payload.kind === 'phigros')
          && (query.data.payload.source.isStale || query.data.payload.catalogSource.isStale)
    ),
  };
}
