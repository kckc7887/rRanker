import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/state/session-store';
import { ScoreService } from '@/services/score-service';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';

const repository = new SqliteSnapshotRepository();

export function useScoreSnapshot() {
  const session = useSession((s) => s.session);
  const scoreProvider = useSession((s) => s.scoreProvider);
  const catalogProvider = useSession((s) => s.catalogProvider);
  const query = useQuery({
    queryKey: ['score-snapshot', session?.mode ?? 'fixture'],
    queryFn: () => new ScoreService(
      scoreProvider,
      catalogProvider,
      session ? repository : undefined,
      session ? repository : undefined,
    ).load(),
  });
  return {
    ...query,
    isDataStale: !!query.data && (query.data.source.isStale || query.data.catalogSource.isStale),
  };
}
