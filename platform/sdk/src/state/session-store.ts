import type { Credential } from '@rranker/sdk/credentials';
import { useStore } from 'zustand';
import { getDataSource, getGameDefinitions, getPluginRevision, isGameAvailable, subscribePlugins } from '@rranker/sdk/registry';
import type { BoundAccount } from '@rranker/sdk/account';
import type { SessionVault } from '@rranker/sdk/domain/session-vault';

import { startTimer } from '@rranker/sdk/utils/startup-timing';
import { accountSession, activeAccount, UNBOUND_ACCOUNT_ID, useAccountStore, type AccountState } from '@rranker/sdk/state/account-store';
import { useDebugStore } from '@rranker/sdk/state/debug-store';
import { resolveAccountClient, releaseResolvedProviders } from '@rranker/sdk/state/session-provider-resolver';

export { UNBOUND_ACCOUNT_ID, replaceRestoredOptionalAccounts, type SessionRestoreStatus } from '@rranker/sdk/state/account-store';

function sessionView(state: AccountState) {
  const account = activeAccount(state);
  const activeAccountId = account?.id ?? UNBOUND_ACCOUNT_ID;
  const session = accountSession(state, activeAccountId);
  const debug = useDebugStore.getState();
  const activeGameId = account?.gameId ?? getGameDefinitions().find(game => isGameAvailable(game.id)
    && (!game.fixture || (debug.hydrated && debug.testAccountsEnabled)))?.id ?? '';
  const sessionsByAccountId: Record<string, Credential> = {};
  const credentialIdsByAccountId: Record<string, string> = {};
  for (const item of state.boundAccounts) {
    if (!item.credentialId) continue;
    credentialIdsByAccountId[item.id] = item.credentialId;
    const credential = state.credentialsById[item.credentialId];
    if (credential) sessionsByAccountId[item.id] = credential;
  }
  return { ...state, activeAccountId, activeGameId, activeProviderId: account?.providerId ?? null, session, sessionsByAccountId, credentialIdsByAccountId,
    get sourceClient() { return resolveAccountClient(activeAccountId); },
  };
}

export type SessionState = ReturnType<typeof sessionView>;
let currentState: AccountState | undefined;
let currentRevision = -1;
let debugEnabled = false;
let currentView: SessionState;

function getState(): SessionState {
  const state = useAccountStore.getState();
  const revision = getPluginRevision();
  const debug = useDebugStore.getState();
  const enabled = debug.hydrated && debug.testAccountsEnabled;
  if (state !== currentState || revision !== currentRevision || enabled !== debugEnabled) {
    debugEnabled = enabled;
    currentState = state;
    currentRevision = revision;
    currentView = sessionView(state);
  }
  return currentView;
}

function subscribe(listener: (state: SessionState, previous: SessionState) => void) {
  let previous = getState();
  const notify = () => {
    const next = getState();
    if (next === previous) return;
    const old = previous;
    previous = next;
    listener(next, old);
  };
  const unsubscribeState = useAccountStore.subscribe(notify);
  const unsubscribePlugins = subscribePlugins(notify);
  const unsubscribeDebug = useDebugStore.subscribe(notify);
  return () => { unsubscribeState(); unsubscribePlugins(); unsubscribeDebug(); };
}

const sessionRuntime = { getState, getInitialState: getState, subscribe };
export const useSession = Object.assign(function useSession<T>(selector: (state: SessionState) => T): T {
  return useStore(sessionRuntime, selector);
}, sessionRuntime);

useAccountStore.subscribe((next, previous) => {
  const released = previous.boundAccounts.filter(account => {
    const current = next.boundAccounts.find(item => item.id === account.id);
    return !current || current.credentialId !== account.credentialId || current.displayName !== account.displayName
      || accountSession(next, account.id) !== accountSession(previous, account.id);
  }).map(account => account.id);
  releaseResolvedProviders(released);
  const previousSources = new Set(previous.boundAccounts.filter(account => account.credentialId).map(account => account.providerId));
  for (const providerId of previousSources) {
    if (providerId && !next.boundAccounts.some(account => account.credentialId && account.providerId === providerId)) {
      getDataSource(providerId)?.onCredentialsReleased?.();
    }
  }
});

export async function restoreSession(load: () => Promise<SessionVault | null>, loadOptionalAccounts?: (accounts: readonly Pick<BoundAccount, 'id' | 'gameId' | 'providerId'>[]) => Promise<BoundAccount[]>): Promise<void> {
  try {
    const stopLoad = startTimer('restore.loadVault');
    const vault = await load();
    stopLoad();
    const stopOptional = startTimer('restore.loadOptionalAccounts');
    const accounts = loadOptionalAccounts ? await loadOptionalAccounts(vault?.accounts ?? []) : [];
    stopOptional();
    useAccountStore.getState().finishRestore(vault, accounts);
  } catch {
    useAccountStore.getState().failRestore('无法读取本机登录状态，请重试恢复。');
  }
}

export { retryPendingRotationWrites } from '@rranker/sdk/services/session-credential-service';
