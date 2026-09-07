import { captureResourceWrites } from '@/services/snapshot-cache-utils';
import { accountAvatarResourceKey } from '@/domain/account-avatar';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';

const AVATAR_RESOURCE_SCHEMA = 1;
const repository = new SqliteSnapshotRepository();

export async function persistBoundAccountAvatar(
  accountId: string,
  avatarUrl: string | null,
): Promise<void> {
  const assertCurrent = captureResourceWrites(accountId.split(':')[0], undefined, accountId);
  const key = accountAvatarResourceKey(accountId);
  const previous = await repository.getResource<{ avatarUrl: string }>(key, AVATAR_RESOURCE_SCHEMA);
  assertCurrent();
  if ((previous?.avatarUrl ?? null) === avatarUrl) return;
  if (!avatarUrl) {
    await repository.deleteResource(key);
    return;
  }
  await repository.saveResource(
    key,
    AVATAR_RESOURCE_SCHEMA,
    new Date().toISOString(),
    { avatarUrl },
    assertCurrent,
  );
}

export { accountAvatarResourceKey };
