import { accountAvatarResourceKey } from '@/domain/account-avatar';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';

const AVATAR_RESOURCE_SCHEMA = 1;
const repository = new SqliteSnapshotRepository();

type StoredAccountAvatar = {
  avatarUrl: string;
};

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

export { accountAvatarResourceKey };
