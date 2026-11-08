import { getPlugins, isGameAvailable, isPluginAvailable, setDisabledPlugins } from '@rranker/sdk/registry';
import { accountIsAvailable, useAccountStore } from '@rranker/sdk/state/account-store';
import { releaseResolvedProviders } from '@rranker/sdk/state/session-provider-resolver';
import { queryClient } from '@rranker/sdk/state/query-client';
import { invalidateResourceWrites } from '@rranker/sdk/services/snapshot-cache-utils';
import { cancelBoundAccountQueries } from '@rranker/sdk/services/invalidate-account-data';

export async function applyDisabledPlugins(disabled: readonly string[]): Promise<void> {
  const available = getPlugins().filter(plugin => isPluginAvailable(plugin.id));
  const accounts = useAccountStore.getState().boundAccounts.filter(accountIsAvailable);
  setDisabledPlugins(disabled);
  const stoppedPlugins = new Set(available.filter(plugin => !isPluginAvailable(plugin.id)).map(plugin => plugin.id));
  const stoppedAccounts = accounts.filter(account => !accountIsAvailable(account));
  const stoppedGames = new Set(available.flatMap(plugin => plugin.kind === 'game'
    ? plugin.games.filter(game => !isGameAvailable(game.id)).map(game => game.id) : []));
  for (const id of stoppedPlugins) invalidateResourceWrites(id);
  for (const id of stoppedGames) invalidateResourceWrites(id);
  releaseResolvedProviders(stoppedAccounts.map(account => account.id));
  const owned = { predicate: (query: { meta?: Record<string, unknown>; queryKey: readonly unknown[] }) =>
    stoppedPlugins.has(String(query.meta?.pluginId)) || stoppedPlugins.has(String(query.meta?.sourcePluginId))
    || stoppedGames.has(String(query.meta?.gameId)) };
  await Promise.all([
    queryClient.cancelQueries(owned),
    ...stoppedAccounts.map(account => cancelBoundAccountQueries(account, queryClient)),
  ]);
  queryClient.removeQueries(owned);
}
