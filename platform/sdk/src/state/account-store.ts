import type { Credential } from '@rranker/sdk/credentials';
import { create } from 'zustand';
import { getDataSource, getGameDefinition, isGameAvailable, isPluginAvailable } from '@rranker/sdk/registry';
import { sameDisplayData, type AccountDisplayData, type BoundAccount } from '@rranker/sdk/account';
import { isTestProvider } from '@rranker/sdk/domain/game-bind-options';
import type { SessionVault } from '@rranker/sdk/domain/session-vault';

import { invalidateResourceWrites } from '@rranker/sdk/services/snapshot-cache-utils';
import { useDebugStore } from '@rranker/sdk/state/debug-store';

export const UNBOUND_ACCOUNT_ID = 'unbound';
export type SessionRestoreStatus = 'restoring' | 'ready' | 'error';

export type AccountState = {
  credentialsById: Record<string, Credential>;
  boundAccounts: BoundAccount[];
  selectedAccountId: string;
  restoreStatus: SessionRestoreStatus;
  restoreError: string | null;
  bindAccounts: (input: { accounts: BoundAccount[]; credentialId: string; session: Credential; activeAccountId: string }) => void;
  updateCredential: (credentialId: string, session: Credential) => void;
  upsertBoundAccount: (account: BoundAccount) => void;
  updateBoundAccountScore: (accountId: string, scoreDisplay: string, displayName?: string, avatarUrl?: string | null,
    displayData?: AccountDisplayData) => void;
  renameLocalAccount: (accountId: string, displayName: string) => void;
  selectBoundAccount: (accountId: string) => void;
  removeBoundAccount: (accountId: string) => void;
  clearSession: () => void;
  finishRestore: (vault: SessionVault | null, optionalAccounts?: BoundAccount[]) => void;
  failRestore: (message: string) => void;
};

export function accountSession(state: Pick<AccountState, 'boundAccounts' | 'credentialsById'>, accountId: string): Credential | null {
  const credentialId = state.boundAccounts.find(account => account.id === accountId)?.credentialId;
  return credentialId ? state.credentialsById[credentialId] ?? null : null;
}

export function accountIsAvailable(account: BoundAccount): boolean {
  const debug = useDebugStore.getState();
  if (isTestProvider(account.providerId) && !(debug.hydrated && debug.testAccountsEnabled)) return false;
  const source = account.providerId ? getDataSource(account.providerId) : undefined;
  return isGameAvailable(account.gameId) && !!source && isPluginAvailable(source.id, account.gameId);
}

export function activeAccount(state: Pick<AccountState, 'boundAccounts' | 'selectedAccountId'>): BoundAccount | undefined {
  const available = state.boundAccounts.filter(accountIsAvailable);
  const sourceOrder = (account: BoundAccount) => account.credentialId ? 0
    : account.providerId && ['local', 'fixture'].includes(getDataSource(account.providerId)?.bindingKind ?? '') ? 2 : 1;
  return available.find(account => account.id === state.selectedAccountId)
    ?? available.sort((a, b) => (getGameDefinition(a.gameId)?.accountOrder ?? 100) - (getGameDefinition(b.gameId)?.accountOrder ?? 100)
      || sourceOrder(a) - sourceOrder(b))[0];
}

function upsert(accounts: BoundAccount[], account: BoundAccount): BoundAccount[] {
  const index = accounts.findIndex(item => item.id === account.id);
  if (index < 0) return [...accounts, account];
  const previous = accounts[index]!;
  const next = { ...account, ...(account.credentialId === undefined && previous.credentialId ? { credentialId: previous.credentialId } : {}) };
  return accounts.map((item, position) => position === index ? next : item);
}

function referencedCredentials(accounts: readonly BoundAccount[], credentials: Record<string, Credential>) {
  const ids = new Set(accounts.flatMap(account => account.credentialId ? [account.credentialId] : []));
  return Object.fromEntries(Object.entries(credentials).filter(([id]) => ids.has(id)));
}

export const useAccountStore = create<AccountState>((set, get) => ({
  credentialsById: {},
  boundAccounts: [],
  selectedAccountId: UNBOUND_ACCOUNT_ID,
  restoreStatus: 'restoring',
  restoreError: null,
  bindAccounts: ({ accounts, credentialId, session, activeAccountId }) => {
    const state = get();
    for (const account of accounts) invalidateResourceWrites('account:' + account.id);
    invalidateResourceWrites('credential:' + credentialId);
    const boundAccounts = accounts.reduce((current, account) => upsert(current, { ...account, credentialId }), state.boundAccounts);
    set({ boundAccounts, credentialsById: referencedCredentials(boundAccounts, { ...state.credentialsById, [credentialId]: session }),
      selectedAccountId: activeAccountId, restoreStatus: 'ready', restoreError: null });
  },
  updateCredential: (credentialId, session) => {
    if (!get().boundAccounts.some(account => account.credentialId === credentialId)) return;
    set({ credentialsById: { ...get().credentialsById, [credentialId]: session } });
  },
  upsertBoundAccount: account => {
    const state = get();
    if (state.boundAccounts.some(item => item.id === account.id)) invalidateResourceWrites('account:' + account.id);
    const boundAccounts = upsert(state.boundAccounts, account);
    set({ boundAccounts });
  },
  updateBoundAccountScore: (accountId, scoreDisplay, displayName, avatarUrl, displayData) => {
    const accounts = get().boundAccounts;
    const account = accounts.find(item => item.id === accountId);
    if (!account) return;
    const next = { ...account, scoreDisplay, displayName: displayName ?? account.displayName,
      ...(avatarUrl !== undefined ? { avatarUrl } : {}), ...(displayData !== undefined ? { displayData } : {}) };
    if (account.scoreDisplay === next.scoreDisplay && account.displayName === next.displayName && account.avatarUrl === next.avatarUrl
      && sameDisplayData(account.displayData, next.displayData)) return;
    set({ boundAccounts: accounts.map(item => item === account ? next : item) });
  },
  renameLocalAccount: (accountId, displayName) => {
    set({ boundAccounts: get().boundAccounts.map(account => account.id === accountId ? { ...account, displayName } : account) });
  },
  selectBoundAccount: accountId => {
    const account = get().boundAccounts.find(item => item.id === accountId);
    if (account && accountIsAvailable(account)) set({ selectedAccountId: accountId });
  },
  removeBoundAccount: accountId => {
    invalidateResourceWrites('account:' + accountId);
    const state = get();
    const boundAccounts = state.boundAccounts.filter(account => account.id !== accountId);
    set({ boundAccounts, credentialsById: referencedCredentials(boundAccounts, state.credentialsById),
      selectedAccountId: state.selectedAccountId === accountId ? UNBOUND_ACCOUNT_ID : state.selectedAccountId });
  },
  clearSession: () => {
    const state = get();
    for (const account of state.boundAccounts) if (account.credentialId) invalidateResourceWrites('account:' + account.id);
    for (const credentialId of Object.keys(state.credentialsById)) invalidateResourceWrites('credential:' + credentialId);
    const boundAccounts = state.boundAccounts.filter(account => !account.credentialId);
    set({ boundAccounts, credentialsById: {}, selectedAccountId: get().selectedAccountId });
  },
  finishRestore: (vault, optionalAccounts = []) => {
    const boundAccounts = (vault?.accounts ?? []).reduce((accounts, account) => upsert(accounts, {
      ...account, scoreLabel: getGameDefinition(account.gameId)?.profile.ratingLabel ?? '',
      providerTitle: getDataSource(account.providerId)?.title ?? account.providerId,
    }), optionalAccounts);
    set({ boundAccounts, credentialsById: Object.fromEntries(vault?.credentials.map(credential => [credential.id, credential.session]) ?? []),
      selectedAccountId: vault?.activeAccountId ?? UNBOUND_ACCOUNT_ID, restoreStatus: 'ready', restoreError: null });
  },
  failRestore: restoreError => { set({ restoreStatus: 'error', restoreError }); },
}));

export function replaceRestoredOptionalAccounts(matches: (account: BoundAccount) => boolean, accounts: BoundAccount[]): void {
  const state = useAccountStore.getState();
  const boundAccounts = accounts.reduce(upsert, state.boundAccounts.filter(account => !matches(account)));
  useAccountStore.setState({ boundAccounts });
}
