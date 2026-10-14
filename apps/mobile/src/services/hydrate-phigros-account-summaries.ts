import { useSession } from '@/state/session-store';
import { SecureSessionStore } from '@/storage/secure-session-store';
import { getForegroundAbortSignal } from '@/state/app-lifecycle-core';
import { hydratePhigrosAccount } from '@/services/resolve-account-avatar';
import { loadItemsBounded } from '@/services/offset-pagination';
import { captureAccountAvatarWrites } from '@/services/resolve-account-avatar-persist';

export async function hydratePhigrosAccountSummaries(
  signal: AbortSignal = getForegroundAbortSignal(),
): Promise<void> {
  const snapshot = useSession.getState();
  const accounts = snapshot.boundAccounts.filter((account) => account.providerId === 'phi-taptap');
  const secureStore = new SecureSessionStore();

  await loadItemsBounded({
    items: accounts.map(account => ({ account, assertCurrent: captureAccountAvatarWrites(account.id, signal) })),
    concurrency: 4,
    signal,
    load: async ({ account, assertCurrent }) => {
      const session = snapshot.sessionsByAccountId[account.id];
      if (session?.mode !== 'phi-session') return;
      try {
        assertCurrent();
        const { summary, avatarUrl, displayName } = await hydratePhigrosAccount(account, session, signal);
        assertCurrent();
        const scoreDisplay = summary.rankingScore.toFixed(4);
        useSession.getState().updateBoundAccountScore(
          account.id,
          scoreDisplay,
          displayName,
          avatarUrl ?? undefined,
          summary.challengeModeRank,
        );
        assertCurrent();
        await secureStore.updateAccountMetadata(account.id, {
          displayName,
          scoreDisplay,
          ...(avatarUrl ? { avatarUrl } : {}),
          challengeModeRank: summary.challengeModeRank,
        }, assertCurrent);
      } catch {
      }
    },
  });
}
