import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/state/session-store';
import { ScoreService } from '@/services/score-service';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';
import { FIXTURE_CURRENT_VERSION } from '@/fixtures/sanitized';

const repository = new SqliteSnapshotRepository();

export function useScoreSnapshot() {
  const session = useSession((s) => s.session);
  const provider = useSession((s) => s.provider);
  const sessionValue = session && 'value' in session ? session.value : null;
  return useQuery({
    queryKey: ['score-snapshot', session?.mode ?? 'fixture', sessionValue],
    queryFn: () => new ScoreService(provider, repository).load(FIXTURE_CURRENT_VERSION),
  });
}
