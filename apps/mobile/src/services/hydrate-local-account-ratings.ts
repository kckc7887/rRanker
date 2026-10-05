import { formatPlayerScore } from '@/domain/game-data';
import { getGameProfile } from '@/domain/game-profile';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';
import { useSession } from '@/state/session-store';
import { loadItemsBounded } from '@/services/offset-pagination';
import { captureResourceWrites } from '@/services/snapshot-cache-utils';

const LOCAL_RATING_CONCURRENCY = 4;
const repository = new SqliteSnapshotRepository();

export async function hydrateLocalAccountRatings(
  signal?: AbortSignal,
): Promise<void> {
  const { boundAccounts, updateBoundAccountScore } = useSession.getState();
  const accounts = boundAccounts.filter((account) => account.gameId === 'maimai' && account.providerId === 'local');
  await loadItemsBounded({
    items: accounts,
    concurrency: LOCAL_RATING_CONCURRENCY,
    signal,
    load: async (account) => {
      const assertCurrent = captureResourceWrites(account.gameId, signal, account.id);
      const snapshot = await repository.getLatest(account.id);
      if (!snapshot) return;
      try { assertCurrent(); } catch { return; }
      updateBoundAccountScore(
        account.id,
        formatPlayerScore(snapshot.best50.rating ?? 0, getGameProfile('maimai').ratingDigits),
      );
    },
  });
}
