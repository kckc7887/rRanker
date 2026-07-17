import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/state/session-store';
import { ScoreService } from '@/services/score-service';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';
import { shouldPersistMaimaiCatalog, shouldPersistScoreSnapshot } from '@/domain/provider-capabilities';

const repository = new SqliteSnapshotRepository();

/** 仅舞萌成绩快照。其他游戏请用 useGameData，避免把空壳游戏接到舞萌流水线上。 */
export function useScoreSnapshot() {
  const session = useSession((s) => s.session);
  const activeAccountId = useSession((s) => s.activeAccountId);
  const activeGameId = useSession((s) => s.activeGameId);
  const activeProviderId = useSession((s) => s.activeProviderId);
  const scoreProvider = useSession((s) => s.scoreProvider);
  const catalogProvider = useSession((s) => s.catalogProvider);
  const enabled = activeGameId === 'maimai';
  const persistScores = enabled && shouldPersistScoreSnapshot(activeProviderId);
  const persistCatalog = enabled && shouldPersistMaimaiCatalog(activeProviderId);
  const query = useQuery({
    enabled,
    queryKey: ['score-snapshot', activeAccountId, activeGameId, activeProviderId, session?.mode ?? 'fixture'],
    queryFn: () => new ScoreService(
      scoreProvider,
      catalogProvider,
      activeAccountId,
      persistScores ? repository : undefined,
      persistCatalog ? repository : undefined,
    ).load(),
  });
  return {
    ...query,
    isDataStale: !!query.data && (query.data.source.isStale || query.data.catalogSource.isStale),
  };
}
