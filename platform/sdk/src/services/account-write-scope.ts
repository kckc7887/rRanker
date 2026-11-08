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
  return () => {
    assertGeneration();
    const current = useAccountStore.getState().boundAccounts.find(item => item.id === accountId);
    if (!account || !current || !accountIsAvailable(current) || current.gameId !== account.gameId
      || current.providerId !== account.providerId || current.credentialId !== account.credentialId) {
      throw new Error('账号请求已失效');
    }
  };
}
