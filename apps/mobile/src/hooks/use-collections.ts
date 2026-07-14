import { useQuery } from '@tanstack/react-query';
import { ResourceService } from '@/services/resource-service';
import { useSession } from '@/state/session-store';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';

const repository = new SqliteSnapshotRepository();

/** 落雪称号/头像/姓名框/背景完整列表（含 required）。 */
export function useCollections() {
  const session = useSession((state) => state.session);
  const activeAccountId = useSession((state) => state.activeAccountId);
  const activeGameId = useSession((state) => state.activeGameId);
  const provider = useSession((state) => state.catalogProvider);
  return useQuery({
    enabled: activeGameId === 'maimai',
    queryKey: ['collections', activeAccountId, activeGameId, session?.mode ?? 'fixture'],
    queryFn: () => new ResourceService(session ? repository : undefined)
      .load('collections', 1, () => provider.getCollections()),
  });
}
