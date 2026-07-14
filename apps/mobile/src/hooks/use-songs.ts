import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/state/session-store';
import { CatalogService } from '@/services/catalog-service';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';

const repository = new SqliteSnapshotRepository();

export function useSongs() {
  const session = useSession((s) => s.session);
  const activeAccountId = useSession((s) => s.activeAccountId);
  const catalogProvider = useSession((s) => s.catalogProvider);
  const query = useQuery({
    queryKey: ['songs', activeAccountId, session?.mode ?? 'fixture'],
    queryFn: () => new CatalogService(catalogProvider, session ? repository : undefined).load(),
  });
  return {
    ...query,
    data: query.data?.songs,
    isDataStale: !!query.data?.source.isStale,
  };
}
