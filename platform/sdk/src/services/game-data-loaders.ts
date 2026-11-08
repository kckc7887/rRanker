import { getGameAdapter, isGameAvailable } from '@rranker/sdk/registry';
import { emptyGamePayload } from '@rranker/sdk/data';
import type { GameDataLoaderContext, GameDataLoadResult } from '@rranker/sdk/data-load';

export function loadGameDataBundle(context: GameDataLoaderContext): Promise<GameDataLoadResult> {
  const adapter = getGameAdapter(context.activeGameId);
  if (!adapter?.loadData || !isGameAvailable(context.activeGameId)) return Promise.resolve({ bundle: {
    gameId: context.activeGameId, providerId: null, profile: context.profile,
    payload: emptyGamePayload(context.activeGameId, '未绑定账号'),
  } });
  return adapter.loadData(context);
}
