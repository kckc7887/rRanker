import { useMemo } from 'react';
import { isTestProvider } from '@rranker/sdk/domain/game-bind-options';
import { useDebugStore } from '@rranker/sdk/state/debug-store';
import { useSession } from '@rranker/sdk/state/session-store';
import { accountIsAvailable } from '@rranker/sdk/state/account-store';
import { usePluginRevision } from '@rranker/sdk/registry';

export function useVisibleBoundAccounts(includeUnavailable = false) {
  const revision = usePluginRevision();
  const accounts = useSession(state => state.boundAccounts);
  const examplesEnabled = useDebugStore(state => state.hydrated && state.testAccountsEnabled);
  return useMemo(() => accounts.filter(account => (examplesEnabled || !isTestProvider(account.providerId))
    && (includeUnavailable || accountIsAvailable(account))),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [accounts, examplesEnabled, includeUnavailable, revision]);
}
