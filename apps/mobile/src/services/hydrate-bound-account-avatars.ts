import {
  accountAvatarResourceKey,
  buildLxnsIconUrl,
} from '@/domain/account-avatar';
import type { BoundAccount } from '@/domain/bound-account';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';
import { useSession } from '@/state/session-store';

const AVATAR_RESOURCE_SCHEMA = 1;
const repository = new SqliteSnapshotRepository();

type StoredAccountAvatar = {
  avatarUrl: string;
};

export async function resolveBoundAccountAvatarUrl(account: BoundAccount): Promise<string | null> {
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

export async function persistBoundAccountAvatar(
  accountId: string,
  avatarUrl: string | null,
): Promise<void> {
  const key = accountAvatarResourceKey(accountId);
  if (!avatarUrl) {
    await repository.deleteResource(key);
    return;
  }
  await repository.saveResource(
    key,
    AVATAR_RESOURCE_SCHEMA,
    new Date().toISOString(),
    { avatarUrl },
  );
}

export async function hydrateBoundAccountAvatars(): Promise<void> {
  const { boundAccounts, updateBoundAccountScore } = useSession.getState();
  await Promise.all(boundAccounts.map(async (account) => {
    if (account.avatarUrl) return;
    const avatarUrl = await resolveBoundAccountAvatarUrl(account);
    if (!avatarUrl) return;
    updateBoundAccountScore(account.id, account.scoreDisplay, account.displayName, avatarUrl);
  }));
}
