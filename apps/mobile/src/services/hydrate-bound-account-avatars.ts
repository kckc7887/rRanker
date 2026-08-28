import {
  accountAvatarResourceKey,
  buildLxnsIconUrl,
} from '@/domain/account-avatar';
import type { BoundAccount } from '@/domain/bound-account';
import { tufPlayerIdFromAccountId } from '@/domain/bound-account';
import {
  buildChunithmMapIconUrl,
  CHUNITHM_PERSONAL_SNAPSHOT_SCHEMA_VERSION,
  chunithmPersonalResourceKey,
  type ChunithmPersonalSnapshot,
} from '@/domain/chunithm-personal';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';
import { useSession } from '@/state/session-store';
import { syncAllAccountAvatars } from '@/services/resolve-account-avatar';
import { resolveTufAvatarUrl } from '@/domain/tuf';
import { TufCache } from '@/services/tuf-cache';
import { getForegroundAbortSignal } from '@/state/app-lifecycle-core';

export { persistBoundAccountAvatar } from '@/services/resolve-account-avatar-persist';

const AVATAR_RESOURCE_SCHEMA = 1;
const repository = new SqliteSnapshotRepository();
const tufCache = new TufCache();

type StoredAccountAvatar = {
  avatarUrl: string;
};

export async function resolveBoundAccountAvatarUrl(account: BoundAccount): Promise<string | null> {
  if (account.avatarUrl) return account.avatarUrl;

  if (account.providerId === 'lxns') {
    if (account.gameId === 'chunithm') {
      const snapshot = await repository.getResource<ChunithmPersonalSnapshot>(
        chunithmPersonalResourceKey(account.id),
        CHUNITHM_PERSONAL_SNAPSHOT_SCHEMA_VERSION,
      );
      return buildChunithmMapIconUrl(snapshot?.player?.map_icon?.id);
    }
    const snapshot = await repository.getLatest(account.id);
    return buildLxnsIconUrl(snapshot?.player.presentation?.iconId);
  }

  if (account.providerId === 'phi-taptap') {
    const cached = await repository.getResource<StoredAccountAvatar>(
      accountAvatarResourceKey(account.id),
      AVATAR_RESOURCE_SCHEMA,
    );
    return cached?.avatarUrl ?? null;
  }

  if (account.providerId === 'tuf') {
    const persisted = await repository.getResource<StoredAccountAvatar>(
      accountAvatarResourceKey(account.id),
      AVATAR_RESOURCE_SCHEMA,
    );
    if (persisted?.avatarUrl) return persisted.avatarUrl;
    const playerId = tufPlayerIdFromAccountId(account.id);
    return playerId === null ? null : resolveTufAvatarUrl((await tufCache.loadPlayer(playerId))?.data);
  }

  return null;
}

export async function hydrateBoundAccountAvatars(
  signal: AbortSignal = getForegroundAbortSignal(),
): Promise<void> {
  const { boundAccounts, sessionsByAccountId, updateBoundAccountScore } = useSession.getState();
  await syncAllAccountAvatars(
    boundAccounts,
    sessionsByAccountId,
    (accountId, avatarUrl) => {
      if (signal.aborted) return;
      const account = useSession.getState().boundAccounts.find((item) => item.id === accountId);
      if (!account) return;
      updateBoundAccountScore(
        accountId,
        account.scoreDisplay,
        account.displayName,
        avatarUrl,
      );
    },
    signal,
  );
}
