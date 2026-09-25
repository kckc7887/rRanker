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
    // 规范查询选项集中在 services/game-data-query.ts：一个实体只有一份新鲜度策略。
    ...GAME_DATA_QUERY_OPTIONS,
    queryFn: async ({ signal }): Promise<GameDataBundle> => {
      const assertCurrent = captureResourceWrites(activeGameId, signal, activeAccountId);
      const hasSessionData = queryClient.getQueryData<GameDataBundle>(queryKey) !== undefined;
      const result = await loadGameDataBundle({
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
        // 加载器不持有查询客户端：发布、读取与失效都经适配层端口。
        publish: (bundle) => publishGameDataBundle(queryClient, queryKey, bundle),
        readEntityValue: (entityKey) => readGameDataBundle(queryClient, entityKey),
        publishEntityValue: (entityKey, value) => publishEntityValue(queryClient, entityKey, value),
        invalidateEntityValue: (entityKey) => invalidateEntityValue(queryClient, entityKey),
      });
      // 后台分离刷新的终态句柄交给适配层登记：主动刷新据此等待「网络与提交全部落定」。
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
