import type { AccountSummary } from '@rranker/sdk/data';
import { useAccountStore } from '@rranker/sdk/state/account-store';
import { SecureSessionStore } from '@rranker/sdk/storage/secure-session-store';
import { persistBoundAccountThumbnail } from '@rranker/sdk/services/account-thumbnail';
import { captureBoundAccountWrites } from '@rranker/sdk/services/account-write-scope';

const secureStore = new SecureSessionStore();

export async function commitAccountMetadata(
  accountId: string,
  metadata: AccountSummary,
  assertCurrent: () => void = captureBoundAccountWrites(accountId),
): Promise<void> {
  assertCurrent();
  const { scoreDisplay, displayName, avatarUrl, displayData, storedDisplayName } = metadata;
  useAccountStore.getState().updateBoundAccountScore(accountId, scoreDisplay, displayName, avatarUrl, displayData);
  await Promise.all([
    persistBoundAccountThumbnail(accountId, { scoreDisplay, avatarUrl, displayData }, assertCurrent),
    ...(storedDisplayName === undefined ? [] : [secureStore.updateAccountMetadata(accountId, {
      displayName: storedDisplayName,
      scoreDisplay,
      ...(displayData !== undefined ? { displayData } : {}),
    }, assertCurrent)]),
  ]);
}
