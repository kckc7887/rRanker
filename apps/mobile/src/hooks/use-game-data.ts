import { captureResourceWrites } from '@/services/snapshot-cache-utils';
import { useQuery } from '@tanstack/react-query';
import type { GameDataBundle } from '@/domain/game-data';
import { getGameProfile } from '@/domain/game-profile';
import { queryClient } from '@/state/query-client';
import { useSession } from '@/state/session-store';
import {
  GAME_DATA_QUERY_OPTIONS,
  gameDataBundleStale,
  gameDataQueryKey,
  invalidateEntityValue,
  publishEntityValue,
  publishGameDataBundle,
  readGameDataBundle,
  registerGameDataBackground,
} from '@/services/game-data-query';
import { useCachedTabActive } from '@/components/CachedTabScreen';
import { gameDataCatalogQueries } from '@/services/game-data-loader-queries';
import { loadGameDataBundle } from '@/services/game-data-loaders';

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
  const protocolScoreProvider = useSession((s) => s.protocolScoreProvider);
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
    notifyOnChangeProps: tabActive ? undefined : [],
    ...GAME_DATA_QUERY_OPTIONS,
    queryFn: async ({ signal }): Promise<GameDataBundle> => {
      const assertCurrent = captureResourceWrites(activeGameId, signal, activeAccountId);
      registerGameDataBackground(queryKey, undefined);
      const hasSessionData = queryClient.getQueryData<GameDataBundle>(queryKey) !== undefined;
      const result = await loadGameDataBundle({
        activeGameId,
        activeProviderId,
        activeAccountId,
        session,
        scoreProvider,
        protocolScoreProvider,
        catalogQueries: gameDataCatalogQueries(queryClient),
        catalogProvider,
        activeAccount,
        profile,
        queryKey,
        hasSessionData,
        signal,
        assertCurrent,
        publish: (bundle) => publishGameDataBundle(queryClient, queryKey, bundle, assertCurrent),
        readEntityValue: (entityKey) => readGameDataBundle(queryClient, entityKey),
        publishEntityValue: (entityKey, value) => { void publishEntityValue(queryClient, entityKey, value, assertCurrent); },
        invalidateEntityValue: (entityKey) => invalidateEntityValue(queryClient, entityKey),
      });
      registerGameDataBackground(queryKey, result.background);
      return result.bundle;
    },
  });

  return {
    ...query,
    profile,
    activeGameId,
    activeProviderId,
    activeAccountId,
    isDataStale: !!query.data?.payload && gameDataBundleStale(query.data),
  };
}
