import { SecureSessionStore } from '@/storage/secure-session-store';
import {
  DEFAULT_LOCAL_PLAYER_NAME,
  LocalAccountStore,
  normalizeLocalPlayerName,
} from '@/storage/local-account-store';
import {
  DEFAULT_DEMO_PLAYER_NAME,
  DemoAccountStore,
} from '@/storage/demo-account-store';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';
import {
  createMaxedChunithmTestAccount,
  createChunithmTempAccount,
  createLocalMaimaiAccount,
  createMaxedMaimaiTestAccount,
  createMaxedMuseDashTestAccount,
  createMaxedPhigrosTestAccount,
  createTufBoundAccount,
  createMuseDashBoundAccount,
  createPhiraBoundAccount,
  LOCAL_MAIMAI_ACCOUNT_ID,
  type BoundAccount,
} from '@/domain/bound-account';
import { ChunithmTempAccountStore } from '@/storage/chunithm-temp-account-store';
import {
  ChunithmDemoAccountStore,
  DEFAULT_CHUNITHM_DEMO_PLAYER_NAME,
} from '@/storage/chunithm-demo-account-store';
import {
  DEFAULT_PHIGROS_DEMO_PLAYER_NAME,
  PhigrosDemoAccountStore,
} from '@/storage/phigros-demo-account-store';
import {
  DEFAULT_MUSEDASH_DEMO_PLAYER_NAME,
  MuseDashDemoAccountStore,
} from '@/storage/musedash-demo-account-store';

import { TufAccountStore } from '@/storage/tuf-account-store';
import { MuseDashAccountStore } from '@/storage/musedash-account-store';
import { PhiraAccountStore } from '@/storage/phira-account-store';

import { restoreSession, useSession, replaceRestoredOptionalAccounts } from '@/state/session-store';
import { recordRuntimeError } from '@/services/runtime-diagnostics-recorder';

const sessions = new SecureSessionStore();
const localAccounts = new LocalAccountStore();
const demoAccounts = new DemoAccountStore();
const chunithmDemoAccount = new ChunithmDemoAccountStore();
const phigrosDemoAccount = new PhigrosDemoAccountStore();
const museDashDemoAccount = new MuseDashDemoAccountStore();
const chunithmTempAccount = new ChunithmTempAccountStore();
const tufAccounts = new TufAccountStore();
const museDashAccounts = new MuseDashAccountStore();
const phiraAccounts = new PhiraAccountStore();
const snapshots = new SqliteSnapshotRepository();

async function loadLocalBoundAccounts() {
  let stored = await localAccounts.load();
  // 已有默认本地玩家数据时迁移一次账号记录。
  if (stored.length === 0) {
    const snapshot = await snapshots.getLatest(LOCAL_MAIMAI_ACCOUNT_ID);
    if (snapshot) {
      const displayName = normalizeLocalPlayerName(snapshot.player.displayName)
        ?? DEFAULT_LOCAL_PLAYER_NAME;
      const profile = { id: LOCAL_MAIMAI_ACCOUNT_ID, displayName };
      await localAccounts.upsert(profile);
      stored = [profile];
    }
  }
  // 首帧只建账号档案（rating 先为 0）；真实 Rating 由 hydrateLocalAccountRatings
  // 首帧后再读取完整成绩，避免启动时阻塞界面。
  return stored.map((profile) => createLocalMaimaiAccount(profile.displayName, 0, profile.id));
}

async function loadDemoBoundAccounts() {
  const stored = await demoAccounts.load();
  return stored.map((profile) => createMaxedMaimaiTestAccount(
    0,
    profile.displayName || DEFAULT_DEMO_PLAYER_NAME,
    profile.id,
  ));
}

async function loadChunithmDemoBoundAccount() {
  const stored = await chunithmDemoAccount.load();
  return stored
    ? createMaxedChunithmTestAccount(
        0,
        stored.displayName || DEFAULT_CHUNITHM_DEMO_PLAYER_NAME,
      )
    : null;
}

async function loadPhigrosDemoBoundAccount() {
  const stored = await phigrosDemoAccount.load();
  return stored
    ? createMaxedPhigrosTestAccount(
        0,
        stored.displayName || DEFAULT_PHIGROS_DEMO_PLAYER_NAME,
      )
    : null;
}

async function loadMuseDashDemoBoundAccount() {
  const stored = await museDashDemoAccount.load();
  return stored
    ? createMaxedMuseDashTestAccount(
        0,
        stored.displayName || DEFAULT_MUSEDASH_DEMO_PLAYER_NAME,
      )
    : null;
}

const single = (account: BoundAccount | null): BoundAccount[] => account ? [account] : [];
const sources = [
  { id: 'local', provider: 'local', load: loadLocalBoundAccounts },
  { id: 'demo', provider: 'maimai-test', load: loadDemoBoundAccounts },
  { id: 'chunithm-demo', provider: 'chunithm-test', load: async () => single(await loadChunithmDemoBoundAccount()) },
  { id: 'phigros-demo', provider: 'phigros-test', load: async () => single(await loadPhigrosDemoBoundAccount()) },
  { id: 'musedash-demo', provider: 'musedash-test', load: async () => single(await loadMuseDashDemoBoundAccount()) },
  { id: 'chunithm-temp', provider: 'chunithm-temp', load: async () => await chunithmTempAccount.load() ? [createChunithmTempAccount()] : [] },
  { id: 'tuf', provider: 'tuf', load: async () => (await tufAccounts.load()).map(createTufBoundAccount) },
  { id: 'musedash', provider: 'musedash-moe', load: async () => (await museDashAccounts.load()).map(createMuseDashBoundAccount) },
  { id: 'phira', provider: 'phira-community', load: async () => (await phiraAccounts.load()).map(createPhiraBoundAccount) },
] as const;
export type AccountSourceStatus = { source: typeof sources[number]['id']; status: 'loading' | 'ready' | 'failed'; errorCode?: 'storage_unavailable' };
let sourceStatuses: readonly AccountSourceStatus[] = [];
const sourceListeners = new Set<() => void>();
export const getAccountSourceStatuses = () => sourceStatuses;
export function subscribeAccountSourceStatuses(listener: () => void): () => void {
  sourceListeners.add(listener); return () => { sourceListeners.delete(listener); };
}
function publishSource(next: AccountSourceStatus): void {
  sourceStatuses = [...sourceStatuses.filter((item) => item.source !== next.source), next];
  for (const listener of sourceListeners) {
    try { listener(); } catch { /* A subscriber must not prevent another source from restoring. */ }
  }
}
async function readAccountSource(source: typeof sources[number]): Promise<BoundAccount[]> {
  publishSource({ source: source.id, status: 'loading' });
  try {
    const accounts = await source.load();
    publishSource({ source: source.id, status: 'ready' });
    return accounts;
  } catch (error) {
    publishSource({ source: source.id, status: 'failed', errorCode: 'storage_unavailable' });
    recordRuntimeError('account-restoration', error, false, { phase: source.id });
    return useSession.getState().boundAccounts.filter((account) => account.providerId === source.provider);
  }
}
export async function loadOptionalBoundAccounts(): Promise<BoundAccount[]> {
  return (await Promise.all(sources.map(readAccountSource))).flat();
}
let retryingSources: Promise<void> | null = null;
export function retryFailedAccountSources(): Promise<void> {
  retryingSources ??= (async () => {
    const failed = sources.filter((source) => sourceStatuses.some((status) => status.source === source.id && status.status === 'failed'));
    const previous = new Map(useSession.getState().boundAccounts.map((account) => [account.id, account]));
    const accounts = (await Promise.all(failed.map(readAccountSource))).flat();
    const providers = new Set(failed.map((source) => source.provider));
    const current = new Map(useSession.getState().boundAccounts.map((account) => [account.id, account]));
    replaceRestoredOptionalAccounts((account) => providers.has(account.providerId as typeof sources[number]['provider']) && previous.get(account.id) === account,
      accounts.filter((account) => previous.has(account.id) ? current.get(account.id) === previous.get(account.id) : !current.has(account.id)));
  })().finally(() => { retryingSources = null; });
  return retryingSources;
}

export function restoreAppAccounts(): Promise<void> {
  return restoreSession(async () => {
    try { return await sessions.loadVault(); }
    catch (error) {
      recordRuntimeError('account-restoration', error, false, { phase: 'vault' });
      throw error;
    }
  }, loadOptionalBoundAccounts);
}
