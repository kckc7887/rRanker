import { formatPlayerScore } from '@/domain/game-data';
import { getGameProfile } from '@/domain/game-profile';
import type { SnapshotRepository } from '@/repositories/snapshot-repository';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';
import { useSession } from '@/state/session-store';

/**
 * 启动后后台补齐本地玩家账号的真实 Rating。
 * 首帧后再读取完整成绩，避免启动时为每个账号解析大型数据。
 */
export async function hydrateLocalAccountRatings(
  repository: SnapshotRepository = new SqliteSnapshotRepository(),
  signal?: AbortSignal,
): Promise<void> {
  const { boundAccounts, updateBoundAccountScore } = useSession.getState();
  await Promise.all(boundAccounts.map(async (account) => {
    if (account.gameId !== 'maimai' || account.providerId !== 'local') return;
    const snapshot = await repository.getLatest(account.id);
    if (!snapshot || signal?.aborted) return;
    updateBoundAccountScore(
      account.id,
      formatPlayerScore(snapshot.best50.rating ?? 0, getGameProfile('maimai').ratingDigits),
    );
  }));
}
