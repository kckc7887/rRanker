import { useQuery } from '@tanstack/react-query';
import { ResourceService } from '@/services/resource-service';
import { useSession } from '@/state/session-store';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';

const repository = new SqliteSnapshotRepository();

export function usePlates() {
  const session = useSession((state) => state.session);
  const provider = useSession((state) => state.catalogProvider);
  return useQuery({
    queryKey: ['plates', session?.mode ?? 'fixture'],
    queryFn: () => new ResourceService(session ? repository : undefined)
      .load('plates', 2, () => provider.getPlates()),
  });
}
