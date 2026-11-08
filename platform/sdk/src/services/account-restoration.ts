import { usePluginStore } from '@rranker/sdk/state/plugin-store';
import { useDebugStore } from '@rranker/sdk/state/debug-store';
import { SecureSessionStore } from '@rranker/sdk/storage/secure-session-store';
import type { BoundAccount } from '@rranker/sdk/account';
import { getDataSources } from '@rranker/sdk/registry';
import { restoreSession, useSession, replaceRestoredOptionalAccounts } from '@rranker/sdk/state/session-store';
import { recordRuntimeError } from '@rranker/sdk/services/runtime-diagnostics-recorder';

const sessions = new SecureSessionStore();
type AccountSource = { id: string; provider: string; gameId: string; load: () => Promise<BoundAccount[]> };
function accountSources(accounts: readonly Pick<BoundAccount, 'id' | 'gameId' | 'providerId'>[] = useSession.getState().boundAccounts): AccountSource[] {
  return getDataSources().flatMap(source => source.restoreAccounts ? source.gameIds.map(gameId => ({
    id: `${source.id}:${gameId}`, provider: source.providerId, gameId, load: () => source.restoreAccounts!(gameId, accounts),
  })) : []);
}
export type AccountSourceStatus = { source: string; status: 'loading' | 'ready' | 'failed'; errorCode?: 'storage_unavailable' };
let sourceStatuses: readonly AccountSourceStatus[] = [];
const sourceListeners = new Set<() => void>();
export const getAccountSourceStatuses = () => sourceStatuses;
export function subscribeAccountSourceStatuses(listener: () => void): () => void {
  sourceListeners.add(listener); return () => { sourceListeners.delete(listener); };
}
function publishSource(next: AccountSourceStatus): void {
  sourceStatuses = [...sourceStatuses.filter((item) => item.source !== next.source), next];
  for (const listener of sourceListeners) listener();
}
async function readAccountSource(source: AccountSource): Promise<BoundAccount[]> {
  publishSource({ source: source.id, status: 'loading' });
  try {
    const accounts = await source.load();
    publishSource({ source: source.id, status: 'ready' });
    return accounts;
  } catch (error) {
    publishSource({ source: source.id, status: 'failed', errorCode: 'storage_unavailable' });
    recordRuntimeError('account-restoration', error, false, { phase: source.id });
    return useSession.getState().boundAccounts.filter((account) => account.providerId === source.provider
      && account.gameId === source.gameId);
  }
}
export async function loadOptionalBoundAccounts(accounts: readonly Pick<BoundAccount, 'id' | 'gameId' | 'providerId'>[] = useSession.getState().boundAccounts): Promise<BoundAccount[]> {
  return (await Promise.all(accountSources(accounts).map(readAccountSource))).flat();
}
let retryingSources: Promise<void> | null = null;
export function retryFailedAccountSources(): Promise<void> {
  retryingSources ??= (async () => {
    const failed = accountSources().filter((source) => sourceStatuses.some((status) => status.source === source.id && status.status === 'failed'));
    const previous = new Map(useSession.getState().boundAccounts.map((account) => [account.id, account]));
    const accounts = (await Promise.all(failed.map(readAccountSource))).flat();
    const current = new Map(useSession.getState().boundAccounts.map((account) => [account.id, account]));
    replaceRestoredOptionalAccounts((account) => failed.some(source => account.providerId === source.provider
      && account.gameId === source.gameId) && previous.get(account.id) === account,
      accounts.filter((account) => previous.has(account.id) ? current.get(account.id) === previous.get(account.id) : !current.has(account.id)));
  })().finally(() => { retryingSources = null; });
  return retryingSources;
}

export async function restoreAppAccounts(): Promise<void> {
  try { await usePluginStore.getState().hydrate(); }
  catch (error) {
    recordRuntimeError('account-restoration', error, false, { phase: 'plugin-preferences' });
    useSession.getState().failRestore('无法读取插件设置，请重试恢复。');
    throw error;
  }
  if (!useDebugStore.getState().hydrated) await useDebugStore.getState().hydrate().catch(error => {
    recordRuntimeError('account-restoration', error, false, { phase: 'debug-preferences' });
  });
  return restoreSession(async () => {
    try { return await sessions.loadVault(); }
    catch (error) {
      recordRuntimeError('account-restoration', error, false, { phase: 'vault' });
      throw error;
    }
  }, loadOptionalBoundAccounts);
}
