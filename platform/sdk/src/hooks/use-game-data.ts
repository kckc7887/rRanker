import { resolveAccountClient } from '@rranker/sdk/state/session-provider-resolver';
import { captureBoundAccountWrites } from '@rranker/sdk/services/account-write-scope';
import { useQuery } from '@tanstack/react-query';
import { getGameAdapter, getDataSource, getGameDefinition, isGameAvailable } from '@rranker/sdk/registry';
import type { GameDataBundle } from '@rranker/sdk/data';
import { getGameProfile } from '@rranker/sdk/domain/game-profile';
import { queryClient } from '@rranker/sdk/state/query-client';
import { useSession, UNBOUND_ACCOUNT_ID } from '@rranker/sdk/state/session-store';
import {
  GAME_DATA_QUERY_OPTIONS,
  gameDataBundleStale,
  gameDataQueryKey,
  invalidateEntityValue,
  publishEntityValue,
  publishGameDataBundle,
  readGameDataBundle,
  registerGameDataBackground,
} from '@rranker/sdk/services/game-data-query';
import { useCachedTabActive } from '@rranker/sdk/components/CachedTabScreen';
import { loadGameDataBundle } from '@rranker/sdk/services/game-data-loaders';

export function useGameData(enabled = true) {
  const tabActive = useCachedTabActive();
  const session = useSession((s) => s.session);
  const activeGameId = useSession((s) => s.activeGameId);
  const activeProviderId = useSession((s) => s.activeProviderId);
  const activeAccountId = useSession((s) => s.activeAccountId);
  const activeAccount = useSession((s) => (
    s.boundAccounts.find((account) => account.id === s.activeAccountId)
  ));
  const profile = getGameDefinition(activeGameId) ? getGameProfile(activeGameId)
    : { id: activeGameId, title: '', ratingLabel: '', ratingDigits: 0, bestSections: [] };

  const queryKey = gameDataQueryKey(
    activeAccountId,
    activeGameId,
    activeProviderId,
    session?.mode ?? null,
  );

  const query = useQuery({
    queryKey,
    meta: { pluginId: getGameAdapter(activeGameId)?.id, sourcePluginId: activeProviderId ? getDataSource(activeProviderId)?.id : undefined,
      gameId: activeGameId, accountId: activeAccountId },
    enabled: enabled && tabActive && activeAccountId !== UNBOUND_ACCOUNT_ID && isGameAvailable(activeGameId),
    notifyOnChangeProps: tabActive ? undefined : [],
    ...GAME_DATA_QUERY_OPTIONS,
    queryFn: async ({ signal }): Promise<GameDataBundle> => {
      const assertCurrent = captureBoundAccountWrites(activeAccountId, signal);
      registerGameDataBackground(queryKey, undefined);
      const hasSessionData = queryClient.getQueryData<GameDataBundle>(queryKey) !== undefined;
      const result = await loadGameDataBundle({
        activeGameId,
        activeProviderId,
        activeAccountId,
        session,
        client: resolveAccountClient(activeAccountId),
        queryClient,
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
