import { useMemo } from 'react';
import { isTestProvider } from '@/domain/game-bind-options';
import { useDebugStore } from '@/state/debug-store';
import { useSession } from '@/state/session-store';

export function useVisibleBoundAccounts() {
  const accounts = useSession(state => state.boundAccounts);
  const examplesEnabled = useDebugStore(state => state.hydrated && state.testAccountsEnabled);
  return useMemo(() => examplesEnabled ? accounts : accounts.filter(account => !isTestProvider(account.providerId)),
    [accounts, examplesEnabled]);
}
