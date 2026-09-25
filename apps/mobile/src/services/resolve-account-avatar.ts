import type { BoundAccount } from '@/domain/bound-account';
import { resolvePhigrosAvatarUrl } from '@/services/phigros-avatar-resolver';
import { ChunithmScoreProvider } from '@/providers/chunithm-score-provider';
import { PhigrosCatalogProvider } from '@/providers/phigros-catalog-provider';
import { PhigrosScoreProvider } from '@/providers/phigros-score-provider';
import { LxnsScoreProvider } from '@/providers/lxns-score-provider';
import { getForegroundAbortSignal } from '@/state/app-lifecycle-core';
import { applyLxnsTokenRotation } from '@/state/session-store';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';
import {
  createAccountAvatarResolver,
  type AccountAvatarResolver,
  type AccountAvatarResolverPorts,
  type PhigrosAccountHydration,
} from '@/services/account-avatar-resolver';
import { persistBoundAccountAvatar } from '@/services/resolve-account-avatar-persist';
import { loadTufPlayerFresh, makeTufSnapshot, TufCache } from '@/services/tuf-cache';

export type { PhigrosAccountHydration };

const repository = new SqliteSnapshotRepository();
const tufCache = new TufCache();

/** 应用运行时装配：落雪轮换、协议客户端、仓储与前台信号都在这里接到真实实现。 */
function createDefaultPorts(): AccountAvatarResolverPorts {
  return {
    snapshots: {
      latest: (accountId) => repository.getLatest(accountId),
      resource: (key, schemaVersion) => repository.getResource(key, schemaVersion),
    },
    providers: {
      lxnsIconId: async (session, accountId, signal) => {
        const provider = new LxnsScoreProvider(
          session,
          (update) => applyLxnsTokenRotation(accountId, update),
        );
        return (await provider.getPlayer(signal)).presentation?.iconId;
      },
      chunithmMapIconId: async (session, accountId, signal) => {
        const provider = new ChunithmScoreProvider(
          session,
          (update) => applyLxnsTokenRotation(accountId, update),
        );
        return (await provider.getPlayer(signal))?.map_icon?.id;
      },
      phigrosAccount: async (account: BoundAccount, session, signal): Promise<PhigrosAccountHydration> => {
        const provider = new PhigrosScoreProvider(session);
        const catalog = new PhigrosCatalogProvider();
        const [summary, gameVersion] = await Promise.all([
          provider.getSummary(signal),
          catalog.getGameVersion(signal),
        ]);
        return { summary, avatarUrl: await resolvePhigrosAvatarUrl(gameVersion, summary.avatar) };
      },
    },
    tuf: {
      cachedPlayer: async (playerId) => (await tufCache.loadPlayer(playerId))?.data ?? null,
      refreshPlayer: async (playerId, signal) => {
        const player = await loadTufPlayerFresh(playerId, signal);
        if (!signal.aborted) void tufCache.savePlayer(playerId, makeTufSnapshot(player)).catch(() => undefined);
        return player;
      },
    },
    persistAvatar: persistBoundAccountAvatar,
    foregroundSignal: getForegroundAbortSignal,
  };
}

const defaultResolver: AccountAvatarResolver = createAccountAvatarResolver(createDefaultPorts());

export const hydratePhigrosAccount = defaultResolver.hydratePhigrosAccount;
export const resolveAccountAvatarUrl = defaultResolver.resolveAccountAvatarUrl;
export const syncAllAccountAvatars = defaultResolver.syncAllAccountAvatars;
