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

import { restoreSession } from '@/state/session-store';

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

export async function loadOptionalBoundAccounts() {
  const [locals, demos, chunithmDemo, phigrosDemo, museDashDemo, hasChunithmTemp, storedTufAccounts, storedMuseDashAccounts, storedPhiraAccounts] = await Promise.all([
    loadLocalBoundAccounts(),
    loadDemoBoundAccounts(),
    loadChunithmDemoBoundAccount(),
    loadPhigrosDemoBoundAccount(),
    loadMuseDashDemoBoundAccount(),
    chunithmTempAccount.load(),
    tufAccounts.load(),
    museDashAccounts.load(),
    phiraAccounts.load(),
  ]);
  return [
    ...locals,
    ...demos,
    ...(chunithmDemo ? [chunithmDemo] : []),
    ...(phigrosDemo ? [phigrosDemo] : []),
    ...(museDashDemo ? [museDashDemo] : []),
    ...(hasChunithmTemp ? [createChunithmTempAccount()] : []),
    ...storedTufAccounts.map((account) => createTufBoundAccount(account)),
    ...storedMuseDashAccounts.map((account) => createMuseDashBoundAccount(account)),
    ...storedPhiraAccounts.map((account) => createPhiraBoundAccount(account)),
  ];
}

export function restoreAppAccounts(): Promise<void> {
  return restoreSession(() => sessions.loadVault(), loadOptionalBoundAccounts);
}
