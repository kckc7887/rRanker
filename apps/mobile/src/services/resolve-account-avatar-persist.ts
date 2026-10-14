import { captureResourceWrites } from '@/services/snapshot-cache-utils';
import { accountAvatarResourceKey, accountAvatarSchemaVersion } from '@/domain/account-avatar';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';
import { useSession } from '@/state/session-store';

const repository = new SqliteSnapshotRepository();

export function captureAccountAvatarWrites(accountId: string, signal?: AbortSignal): () => void {
  const state = useSession.getState();
  const account = state.boundAccounts.find(item => item.id === accountId);
  const credentialId = state.credentialIdsByAccountId[accountId];
  const assertGeneration = captureResourceWrites(account?.gameId ?? accountId.split(':')[0], signal, accountId);
  return () => {
    assertGeneration();
    const current = useSession.getState();
    const bound = current.boundAccounts.find(item => item.id === accountId);
    if (!account || !bound || bound.gameId !== account.gameId || bound.providerId !== account.providerId
      || current.credentialIdsByAccountId[accountId] !== credentialId) throw new Error('账号请求已失效');
  };
}

export async function persistBoundAccountAvatar(
  accountId: string,
  avatarUrl: string | null,
  assertEligible?: () => void,
): Promise<void> {
  const assertCurrent = assertEligible ?? captureAccountAvatarWrites(accountId);
  assertCurrent();
  const key = accountAvatarResourceKey(accountId);
  const schemaVersion = accountAvatarSchemaVersion(accountId);
  const previous = await repository.getResource<{ avatarUrl: string }>(key, schemaVersion);
  assertCurrent();
  if ((previous?.avatarUrl ?? null) === avatarUrl) return;
  if (!avatarUrl) {
    await repository.deleteResource(key);
    return;
  }
  await repository.saveResource(
    key,
    schemaVersion,
    new Date().toISOString(),
    { avatarUrl },
    assertCurrent,
  );
}

export { accountAvatarResourceKey };
