import type { ProviderId } from '@/domain/game-bind-options';
import { clearMajdataAccount } from '@/services/majdata-service';
import { clearRizlineAccount } from '@/services/rizline-service';
import {
  createAdditionalLocalMaimaiAccountId,
  createLocalMaimaiAccount,
  createMaxedChunithmTestAccount,
  createMaxedMaimaiTestAccount,
  createMaxedMuseDashTestAccount,
  createMaxedPhigrosTestAccount,
  createMuseDashBoundAccount,
  createTufBoundAccount,
  createPhiraBoundAccount,
  phiraPlayerIdFromAccountId,
  museDashUserIdFromAccountId,
  osuUserIdFromAccountId,
  tufPlayerIdFromAccountId,
  MUSEDASH_TEST_USER_ID,
  LOCAL_MAIMAI_ACCOUNT_ID,
  type BoundAccount,
} from '@/domain/bound-account';
import { SecureSessionStore } from '@/storage/secure-session-store';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';
import { OsuCache } from '@/services/osu-cache';
import { isOsuGameId } from '@/domain/game-mode-family';
import { queryClient } from '@/state/query-client';
import { UNBOUND_ACCOUNT_ID, useSession } from '@/state/session-store';
import { LocalAccountStore } from '@/storage/local-account-store';
import { DemoAccountStore } from '@/storage/demo-account-store';
import { ChunithmTempAccountStore } from '@/storage/chunithm-temp-account-store';
import { ChunithmDemoAccountStore } from '@/storage/chunithm-demo-account-store';
import { PhigrosDemoAccountStore } from '@/storage/phigros-demo-account-store';
import { MuseDashDemoAccountStore } from '@/storage/musedash-demo-account-store';
import { patchMaimaiPlayerDisplayName } from '@/services/invalidate-account-data';
import { TufAccountStore } from '@/storage/tuf-account-store';
import { TufCache } from '@/services/tuf-cache';
import { MuseDashAccountStore } from '@/storage/musedash-account-store';
import { MuseDashCache } from '@/services/muse-dash-cache';
import { resolveTufAvatarUrl } from '@/domain/tuf';
import { PhiraAccountStore } from '@/storage/phira-account-store';
import { PhiraCache } from '@/services/phira-cache';

const sessions = new SecureSessionStore();
const snapshots = new SqliteSnapshotRepository();
const localAccounts = new LocalAccountStore();
const demoAccounts = new DemoAccountStore();
const chunithmDemoAccount = new ChunithmDemoAccountStore();
const phigrosDemoAccount = new PhigrosDemoAccountStore();
const museDashDemoAccount = new MuseDashDemoAccountStore();
const chunithmTempAccount = new ChunithmTempAccountStore();
const tufAccounts = new TufAccountStore();
const tufCache = new TufCache();
const museDashAccounts = new MuseDashAccountStore();
const museDashCache = new MuseDashCache();
const phiraAccounts = new PhiraAccountStore();
const phiraCache = new PhiraCache();
const osuCache = new OsuCache();

export async function persistActiveAccountId(): Promise<void> {
  const nextId = useSession.getState().activeAccountId;
  await sessions.setActiveAccountId(!nextId || nextId === UNBOUND_ACCOUNT_ID ? null : nextId);
}

export async function createLocalBoundAccount(accounts: readonly BoundAccount[]): Promise<BoundAccount> {
  const localCount = accounts.filter(account => account.providerId === 'local').length;
  const account = createLocalMaimaiAccount(localCount === 0 ? '本地玩家' : `本地玩家 ${localCount + 1}`, 0,
    localCount === 0 ? LOCAL_MAIMAI_ACCOUNT_ID : createAdditionalLocalMaimaiAccountId(accounts.map(item => item.id)));
  await localAccounts.upsert({ id: account.id, displayName: account.displayName });
  return account;
}

type DemoAccountBinding = { create: () => BoundAccount; persist: (account: BoundAccount) => Promise<void>; label: string };

const demoBindings: Partial<Record<ProviderId, DemoAccountBinding>> = {
    'maimai-test': { create: createMaxedMaimaiTestAccount, persist: (account: BoundAccount) => demoAccounts.upsert({ id: account.id, displayName: account.displayName }), label: '' },
    'chunithm-test': { create: createMaxedChunithmTestAccount, persist: (account: BoundAccount) => chunithmDemoAccount.save({ id: account.id, displayName: account.displayName }), label: '中二节奏' },
    'phigros-test': { create: createMaxedPhigrosTestAccount, persist: (account: BoundAccount) => phigrosDemoAccount.save({ id: account.id, displayName: account.displayName }), label: ' Phigros ' },
    'musedash-test': { create: createMaxedMuseDashTestAccount, persist: (account: BoundAccount) => museDashDemoAccount.save({ id: account.id, displayName: account.displayName }), label: '喵斯快跑' },
};

export function demoAccountBinding(providerId: ProviderId | null): DemoAccountBinding | undefined {
  return providerId ? demoBindings[providerId] : undefined;
}

export function tufPlayerBinding(player: import('@/domain/tuf').TufPlayer) {
  return { id: `adofai:tuf:${player.id}`,
    create: () => createTufBoundAccount({ playerId: player.id, displayName: player.name, avatarUrl: resolveTufAvatarUrl(player) }),
    persist: async (account: BoundAccount) => { await tufAccounts.upsert({ playerId: player.id, displayName: player.name, avatarUrl: account.avatarUrl }); },
  };
}

export function phiraPlayerBinding(player: import('@/domain/phira').PhiraUser) {
  return {
    create: () => createPhiraBoundAccount({ playerId: player.id, displayName: player.name, rks: player.rks, avatarUrl: player.avatar }),
    persist: async () => { await phiraAccounts.upsert({ playerId: player.id, displayName: player.name, avatarUrl: player.avatar }); },
  };
}

export function museDashPlayerBinding(player: { userId: string; nickname: string }) {
  return { id: `musedash:musedash-moe:${player.userId}`,
    create: () => createMuseDashBoundAccount({ userId: player.userId, displayName: player.nickname }),
    persist: async () => { await museDashAccounts.upsert({ userId: player.userId, displayName: player.nickname }); },
  };
}

export async function saveLocalAccountName(account: BoundAccount, displayName: string): Promise<void> {
  await localAccounts.upsert({ id: account.id, displayName });
  useSession.getState().renameLocalAccount(account.id, displayName);
  patchMaimaiPlayerDisplayName(account.id, displayName, queryClient);
}

export type AccountCleanupAttempt = (label: string, action: () => Promise<unknown>) => Promise<void>;

export async function clearBoundAccountData(account: BoundAccount, attempt: AccountCleanupAttempt): Promise<void> {
  if (account.providerId === 'local') {
    await attempt('账号', () => localAccounts.remove(account.id));
    await attempt('成绩', () => snapshots.clear(account.id));
  } else if (demoAccountBinding(account.providerId)) {
    await attempt('账号', async () => {
      if (account.providerId === 'chunithm-test') await chunithmDemoAccount.remove();
      else if (account.providerId === 'phigros-test') await phigrosDemoAccount.remove();
      else if (account.providerId === 'musedash-test') {
        await museDashDemoAccount.remove();
        await museDashCache.clearPlayer(MUSEDASH_TEST_USER_ID);
      } else await demoAccounts.remove(account.id);
    });
  } else if (account.providerId === 'chunithm-temp') {
    await attempt('账号', () => chunithmTempAccount.remove());
  } else if (account.providerId === 'tuf') {
    const playerId = tufPlayerIdFromAccountId(account.id);
    if (playerId !== null) {
      await attempt('账号', () => tufAccounts.remove(playerId));
      await attempt('缓存', () => tufCache.clearPlayer(playerId));
    }
  } else if (account.providerId === 'phira-community') {
    const playerId = phiraPlayerIdFromAccountId(account.id);
    if (playerId !== null) {
      await attempt('账号', () => phiraAccounts.remove(playerId));
      await attempt('缓存', () => phiraCache.clearPlayer(playerId));
    }
  } else if (account.providerId === 'musedash-moe') {
    const userId = museDashUserIdFromAccountId(account.id);
    if (userId !== null) {
      await attempt('账号', () => museDashAccounts.remove(userId));
      await attempt('缓存', () => museDashCache.clearPlayer(userId));
    }
  } else {
    if (account.gameId === 'majdata-net') {
      await attempt('成绩缓存', () => clearMajdataAccount(account.id));
    }
    if (account.gameId === 'rizline') {
      await attempt('成绩缓存', () => clearRizlineAccount(account.id));
    }
    await attempt('凭据', () => sessions.removeAccount(account.id));
    await attempt('缓存', () => snapshots.clear(account.id));
    if (account.providerId === 'osu' && isOsuGameId(account.gameId)) {
      const userId = osuUserIdFromAccountId(account.id);
      const gameId = account.gameId;
      if (userId !== null) await attempt('模式缓存', () => osuCache.clear(gameId, userId));
    }
  }
}
