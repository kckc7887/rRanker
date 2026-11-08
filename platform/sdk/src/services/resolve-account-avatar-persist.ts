import { persistBoundAccountThumbnail } from '@rranker/sdk/services/account-thumbnail';

export function persistBoundAccountAvatar(
  accountId: string,
  avatarUrl: string | null,
  assertEligible?: () => void,
): Promise<void> {
  return persistBoundAccountThumbnail(accountId, { avatarUrl }, assertEligible);
}
