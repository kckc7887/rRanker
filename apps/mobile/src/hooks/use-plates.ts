import { useQuery } from '@tanstack/react-query';
import { ResourceService } from '@/services/resource-service';
import { useSession } from '@/state/session-store';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';

const repository = new SqliteSnapshotRepository();

/** 仅舞萌姓名框。 */
export function usePlates() {
  const session = useSession((state) => state.session);
  const activeAccountId = useSession((state) => state.activeAccountId);
  const activeGameId = useSession((state) => state.activeGameId);
  const provider = useSession((state) => state.catalogProvider);
  return useQuery({
    enabled: activeGameId === 'maimai',
    queryKey: ['plates', activeAccountId, activeGameId, session?.mode ?? 'fixture'],
    queryFn: () => new ResourceService(session ? repository : undefined)
      .load('plates', 2, () => provider.getPlates()),
  });
}
