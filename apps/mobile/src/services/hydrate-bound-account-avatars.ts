import { useSession } from '@/state/session-store';
import { syncAllAccountAvatars } from '@/services/resolve-account-avatar';
import { getForegroundAbortSignal } from '@/state/app-lifecycle-core';

export { persistBoundAccountAvatar } from '@/services/resolve-account-avatar-persist';

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
