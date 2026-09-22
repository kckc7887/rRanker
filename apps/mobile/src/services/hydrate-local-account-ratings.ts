import { formatPlayerScore } from '@/domain/game-data';
import { getGameProfile } from '@/domain/game-profile';
import type { SnapshotRepository } from '@/repositories/snapshot-repository';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';
import { useSession } from '@/state/session-store';
import { loadItemsBounded } from '@/services/offset-pagination';
import { captureResourceWrites } from '@/services/snapshot-cache-utils';

const LOCAL_RATING_CONCURRENCY = 4;

/**
 * 启动后后台补齐本地玩家账号的真实 Rating。
 * 首帧后再读取完整成绩，避免启动时为每个账号解析大型数据。
 */
export async function hydrateLocalAccountRatings(
  repository: SnapshotRepository = new SqliteSnapshotRepository(),
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
      if (!snapshot || signal?.aborted) return;
      try { assertCurrent(); } catch { return; }
      updateBoundAccountScore(
        account.id,
        formatPlayerScore(snapshot.best50.rating ?? 0, getGameProfile('maimai').ratingDigits),
      );
    },
  });
}
