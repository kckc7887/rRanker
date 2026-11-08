import { getDataSource } from '@rranker/sdk/registry';
import { accountIsAvailable, useAccountStore } from '@rranker/sdk/state/account-store';
import { captureResourceWrites, resourceWriteGeneration } from '@rranker/sdk/services/snapshot-cache-utils';

export function accountWriteKey(accountId: string): string {
  const account = useAccountStore.getState().boundAccounts.find(item => item.id === accountId);
  return `${accountId}:${account?.gameId ?? ''}:${account?.providerId ?? ''}:${account?.credentialId ?? ''}`
    + `:${resourceWriteGeneration(account?.gameId ?? accountId.split(':')[0])}:${resourceWriteGeneration('account:' + accountId)}`;
}

export function captureBoundAccountWrites(accountId: string, signal?: AbortSignal): () => void {
  const account = useAccountStore.getState().boundAccounts.find(item => item.id === accountId);
  const assertGeneration = captureResourceWrites(account?.gameId ?? accountId.split(':')[0], signal, accountId);
  const source = account?.providerId ? getDataSource(account.providerId) : undefined;
  const assertSource = source ? captureResourceWrites(source.id, signal) : undefined;
  return () => {
    assertGeneration();
    assertSource?.();
    const current = useAccountStore.getState().boundAccounts.find(item => item.id === accountId);
    if (!account || !current || !accountIsAvailable(current) || current.gameId !== account.gameId
      || current.providerId !== account.providerId || current.credentialId !== account.credentialId) {
      throw new Error('账号请求已失效');
    }
  };
}

export function captureAccountWrites(accounts: readonly { id: string }[]): (accountId: string) => void {
  const guards = new Map<string, () => void>();
  for (const account of accounts) {
    if (guards.has(account.id)) continue;
    const assertCurrent = captureBoundAccountWrites(account.id);
    assertCurrent();
    guards.set(account.id, assertCurrent);
  }
  return accountId => {
    const assertCurrent = guards.get(accountId);
    if (!assertCurrent) throw new Error('账号请求已失效');
    assertCurrent();
  };
}
