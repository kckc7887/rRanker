import { captureResourceWrites } from '@rranker/sdk/services/snapshot-cache-utils';
import type { Credential } from '@rranker/sdk/credentials';
import { getDataSource, getPluginRevision } from '@rranker/sdk/registry';
import { accountIsAvailable, accountSession, useAccountStore } from '@rranker/sdk/state/account-store';
import { accountWriteKey, captureBoundAccountWrites } from '@rranker/sdk/services/account-write-scope';
import { commitCredential } from '@rranker/sdk/services/session-credential-service';

type CachedClient = { key: string; displayName: string; credential: Credential | null; client: unknown };
const clients = new Map<string, CachedClient>();

export function resolveAccountClient(accountId: string): unknown {
  const state = useAccountStore.getState();
  const account = state.boundAccounts.find(item => item.id === accountId);
  if (!account || !accountIsAvailable(account) || !account.providerId) return undefined;
  const source = getDataSource(account.providerId);
  if (!source?.createClient) return undefined;
  const credential = accountSession(state, accountId);
  const key = `${accountWriteKey(accountId)}:${getPluginRevision()}`;
  const cached = clients.get(accountId);
  if (cached?.key === key && cached.displayName === account.displayName && cached.credential === credential) return cached.client;
  const assertCurrent = captureBoundAccountWrites(accountId);
  const assertSource = captureResourceWrites(source.id);
  const assertCredential = account.credentialId ? captureResourceWrites('credential:' + account.credentialId) : () => undefined;
  const client = source.createClient({ account, get credential() {
    assertSource(); assertCredential();
    return account.credentialId ? useAccountStore.getState().credentialsById[account.credentialId] ?? null : null;
  }, assertCurrent,
    commitCredential: (next, expected) => account.credentialId
      ? commitCredential({ credentialId: account.credentialId, providerId: source.providerId, next, expected, assertCurrent: () => { assertSource(); assertCredential(); } })
      : Promise.resolve('removed' as const) });
  clients.set(accountId, { key, displayName: account.displayName, credential, client });
  return client;
}

export function releaseResolvedProviders(accountIds: readonly string[]): void {
  for (const accountId of accountIds) clients.delete(accountId);
}
