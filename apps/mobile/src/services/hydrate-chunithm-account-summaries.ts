import {
  buildChunithmMapIconUrl,
  CHUNITHM_PERSONAL_SNAPSHOT_SCHEMA_VERSION,
  chunithmPersonalResourceKey,
  type ChunithmPersonalSnapshot,
} from '@/domain/chunithm-personal';
import { useSession } from '@/state/session-store';
import { SecureSessionStore } from '@/storage/secure-session-store';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';

const repository = new SqliteSnapshotRepository();

/** 从分账号缓存补齐中二账号列表所需的 Rating、领域与头像摘要。 */
export async function hydrateChunithmAccountSummaries(signal?: AbortSignal): Promise<void> {
  const accounts = useSession.getState().boundAccounts.filter(
    (account) => account.gameId === 'chunithm' && account.providerId === 'lxns',
  );
  const secureStore = new SecureSessionStore();

  await Promise.all(accounts.map(async (account) => {
    try {
      const snapshot = await repository.getResource<ChunithmPersonalSnapshot>(
        chunithmPersonalResourceKey(account.id),
        CHUNITHM_PERSONAL_SNAPSHOT_SCHEMA_VERSION,
      );
      const player = snapshot?.player;
      if (!player || signal?.aborted) return;

      const scoreDisplay = player.rating.toFixed(2);
      const avatarUrl = buildChunithmMapIconUrl(player.map_icon?.id);
      useSession.getState().updateBoundAccountScore(
        account.id,
        scoreDisplay,
        player.name,
        avatarUrl ?? undefined,
        undefined,
        player.rating_possession ?? null,
      );
      if (signal?.aborted) return;
      await secureStore.updateAccountMetadata(account.id, {
        displayName: player.name,
        scoreDisplay,
        ratingPossession: player.rating_possession ?? null,
      });
    } catch {
      // 单个账号缓存读取失败不阻断列表；保留上次持久化的元数据。
    }
  }));
}
