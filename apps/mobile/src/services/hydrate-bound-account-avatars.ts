import {
  accountAvatarResourceKey,
  buildLxnsIconUrl,
} from '@/domain/account-avatar';
import type { BoundAccount } from '@/domain/bound-account';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';
import { useSession } from '@/state/session-store';
import { syncAllAccountAvatars } from '@/services/resolve-account-avatar';

export { persistBoundAccountAvatar } from '@/services/resolve-account-avatar-persist';

const AVATAR_RESOURCE_SCHEMA = 1;
const repository = new SqliteSnapshotRepository();

type StoredAccountAvatar = {
  avatarUrl: string;
};

export async function resolveBoundAccountAvatarUrl(account: BoundAccount): Promise<string | null> {
  if (account.avatarUrl) return account.avatarUrl;

  if (account.providerId === 'lxns') {
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

  return null;
}

export async function hydrateBoundAccountAvatars(): Promise<void> {
  const { boundAccounts, sessionsByAccountId, updateBoundAccountScore } = useSession.getState();
  await syncAllAccountAvatars(
    boundAccounts,
    sessionsByAccountId,
    (accountId, avatarUrl) => {
      const account = useSession.getState().boundAccounts.find((item) => item.id === accountId);
      if (!account) return;
      updateBoundAccountScore(
        accountId,
        account.scoreDisplay,
        account.displayName,
        avatarUrl,
      );
    },
  );
}
