import type { BoundAccount } from '@rranker/sdk/account';
import type { AccountSummary } from '@rranker/sdk/data';
import { getDataSource } from '@rranker/sdk/registry';
import { accountIsAvailable, accountSession, useAccountStore } from '@rranker/sdk/state/account-store';
import { resolveAccountClient } from '@rranker/sdk/state/session-provider-resolver';
import { queryClient } from '@rranker/sdk/state/query-client';
import { getForegroundAbortSignal } from '@rranker/sdk/state/app-lifecycle-core';
import { accountWriteKey, captureBoundAccountWrites } from './account-write-scope';
import { hydrateBoundAccountThumbnails } from './account-thumbnail';
import { commitAccountMetadata } from './account-metadata';
import { createInflightGuard, subscribeResourceWrites } from './snapshot-cache-utils';
import { loadItemsBounded } from './offset-pagination';

const inflight = createInflightGuard<string>();

export function hydrateAccountSummary(accountId: string, signal: AbortSignal = getForegroundAbortSignal()): Promise<AccountSummary | undefined> {
  const assertAccount = captureBoundAccountWrites(accountId);
  return inflight.share(accountWriteKey(accountId), async requestSignal => {
    assertAccount();
    const state = useAccountStore.getState();
    const account = state.boundAccounts.find(item => item.id === accountId)!;
    const source = account.providerId ? getDataSource(account.providerId) : undefined;
    const controller = new AbortController();
    const cancel = () => controller.abort(requestSignal.reason ?? new Error('账号请求已失效'));
    requestSignal.addEventListener('abort', cancel, { once: true });
    const scopes = [account.gameId, `account:${account.id}`, ...(source ? [source.id] : [])];
    const subscriptions = scopes.map(scope => subscribeResourceWrites(scope, cancel));
    const assertCurrent = () => { if (controller.signal.aborted) throw controller.signal.reason; assertAccount(); };
    try {
      if (requestSignal.aborted) cancel();
      assertCurrent();
      const metadata = await source?.hydrateAccount?.({ account, credential: accountSession(state, accountId),
        client: resolveAccountClient(accountId), queryClient, signal: controller.signal, assertCurrent });
      if (metadata) await commitAccountMetadata(accountId, metadata, assertCurrent);
      return metadata;
    } finally {
      requestSignal.removeEventListener('abort', cancel);
      for (const unsubscribe of subscriptions) unsubscribe();
    }
  }, signal);
}

export async function hydrateAccountSummaries(signal: AbortSignal = getForegroundAbortSignal(), accounts: readonly BoundAccount[] = useAccountStore.getState().boundAccounts): Promise<void> {
  await loadItemsBounded({ items: accounts.filter(account => accountIsAvailable(account)
    && !!account.providerId && !!getDataSource(account.providerId)?.hydrateAccount), concurrency: 3, signal,
    load: account => hydrateAccountSummary(account.id, signal).catch(() => undefined) });
}

const displayHydrations = new WeakMap<AbortSignal, { key: string; promise: Promise<void> }>();
export function hydrateAccountDisplayData(signal: AbortSignal = getForegroundAbortSignal()): Promise<void> {
  const key = useAccountStore.getState().boundAccounts.filter(accountIsAvailable).map(account => accountWriteKey(account.id)).join('|');
  const existing = displayHydrations.get(signal);
  if (existing?.key === key) return existing.promise;
  const promise = hydrateBoundAccountThumbnails(signal)
    .then(() => hydrateAccountSummaries(signal));
  displayHydrations.set(signal, { key, promise });
  const release = () => { if (displayHydrations.get(signal)?.promise === promise) displayHydrations.delete(signal); };
  void promise.then(release, release);
  return promise;
}
