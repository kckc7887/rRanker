import { formatPlayerScore } from '@/domain/game-data';
import { getGameProfile } from '@/domain/game-profile';
import type { SnapshotRepository } from '@/repositories/snapshot-repository';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';
import { useSession } from '@/state/session-store';

/**
 * 启动后后台补齐本地玩家账号的真实 Rating。
 * 首帧不再为每个本地账号读取并解析整份成绩快照（只为拿 best50.rating 一个数字），
 * 改为首帧后懒读并推送；无快照的账号保持初始 0，展示值最终与旧行为一致。
 */
export async function hydrateLocalAccountRatings(
  repository: SnapshotRepository = new SqliteSnapshotRepository(),
): Promise<void> {
  const { boundAccounts, updateBoundAccountScore } = useSession.getState();
  await Promise.all(boundAccounts.map(async (account) => {
    if (account.gameId !== 'maimai' || account.providerId !== 'local') return;
    const snapshot = await repository.getLatest(account.id);
    if (!snapshot) return;
    updateBoundAccountScore(
      account.id,
      formatPlayerScore(snapshot.best50.rating ?? 0, getGameProfile('maimai').ratingDigits),
    );
  }));
}
