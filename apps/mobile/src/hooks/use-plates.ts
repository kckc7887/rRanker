import { useQuery } from '@tanstack/react-query';
import type { PlateSnapshot } from '@/domain/models';
import { ResourceService, staleCachedResource } from '@/services/resource-service';
import { useSession } from '@/state/session-store';
import { queryClient } from '@/state/query-client';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';

const repository = new SqliteSnapshotRepository();

/** 仅舞萌姓名框。 */
export function usePlates() {
  const session = useSession((state) => state.session);
  const activeAccountId = useSession((state) => state.activeAccountId);
  const activeGameId = useSession((state) => state.activeGameId);
  const provider = useSession((state) => state.catalogProvider);
  const queryKey = ['plates', activeAccountId, activeGameId, session?.mode ?? 'fixture'];
  const resourceKey = 'plates';
  const schemaVersion = 2;
  return useQuery({
    enabled: activeGameId === 'maimai',
    queryKey,
    queryFn: async () => {
      const service = new ResourceService(session ? repository : undefined);
      const loadFresh = () => service.load(resourceKey, schemaVersion, () => provider.getPlates());
      // 已登录时缓存优先：先渲染本地缓存，后台刷新成功后静默回写。
      if (session) {
        const cached = await service.getCached<PlateSnapshot>(resourceKey, schemaVersion);
        if (cached) {
          void loadFresh().then((fresh) => {
            if (fresh.source.kind !== 'cache') queryClient.setQueryData(queryKey, fresh);
          }).catch(() => undefined);
          return staleCachedResource(cached);
        }
      }
      return loadFresh();
    },
  });
}
