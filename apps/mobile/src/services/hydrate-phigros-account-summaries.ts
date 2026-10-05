import { useSession } from '@/state/session-store';
import { SecureSessionStore } from '@/storage/secure-session-store';
import { getForegroundAbortSignal } from '@/state/app-lifecycle-core';
import { hydratePhigrosAccount } from '@/services/resolve-account-avatar';
import { loadItemsBounded } from '@/services/offset-pagination';

export async function hydratePhigrosAccountSummaries(
  signal: AbortSignal = getForegroundAbortSignal(),
): Promise<void> {
  const snapshot = useSession.getState();
  const accounts = snapshot.boundAccounts.filter((account) => account.providerId === 'phi-taptap');
  const secureStore = new SecureSessionStore();

  await loadItemsBounded({
    items: accounts,
    concurrency: 4,
    signal,
    load: async (account) => {
      const session = snapshot.sessionsByAccountId[account.id];
      if (session?.mode !== 'phi-session') return;
      try {
        const { summary, avatarUrl } = await hydratePhigrosAccount(account, session, signal);
        if (signal.aborted) return;
        const scoreDisplay = summary.rankingScore.toFixed(4);
        useSession.getState().updateBoundAccountScore(
          account.id,
          scoreDisplay,
          session.playerId,
          avatarUrl ?? undefined,
          summary.challengeModeRank,
        );
        if (signal.aborted) return;
        await secureStore.updateAccountMetadata(account.id, {
          displayName: session.playerId,
          scoreDisplay,
          ...(avatarUrl ? { avatarUrl } : {}),
          challengeModeRank: summary.challengeModeRank,
        });
      } catch {
      }
    },
  });
}
