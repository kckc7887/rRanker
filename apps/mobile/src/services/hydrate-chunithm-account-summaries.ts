import {
  buildChunithmMapIconUrl,
  CHUNITHM_PERSONAL_SNAPSHOT_SCHEMA_VERSION,
  ChunithmPersonalSnapshotSchema,
  chunithmPersonalResourceKey,
} from '@/domain/chunithm-personal';
import { useSession } from '@/state/session-store';
import { SecureSessionStore } from '@/storage/secure-session-store';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';
import { loadItemsBounded } from '@/services/offset-pagination';

const repository = new SqliteSnapshotRepository();

export async function hydrateChunithmAccountSummaries(signal?: AbortSignal): Promise<void> {
  const accounts = useSession.getState().boundAccounts.filter(
    (account) => account.gameId === 'chunithm' && account.providerId === 'lxns',
  );
  const secureStore = new SecureSessionStore();

  await loadItemsBounded({
    items: accounts,
    concurrency: 4,
    signal,
    load: async (account) => {
      try {
        const snapshot = await repository.getResource(
          chunithmPersonalResourceKey(account.id),
          CHUNITHM_PERSONAL_SNAPSHOT_SCHEMA_VERSION,
          ChunithmPersonalSnapshotSchema,
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
      }
    },
  });
}
