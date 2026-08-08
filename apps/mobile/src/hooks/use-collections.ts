import { useQuery } from '@tanstack/react-query';
import type { CollectionSnapshot } from '@/domain/models';
import { ResourceService, staleCachedResource } from '@/services/resource-service';
import { useSession } from '@/state/session-store';
import { queryClient } from '@/state/query-client';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';

const repository = new SqliteSnapshotRepository();

/** 落雪称号/头像/姓名框/背景完整列表（含 required）。 */
export function useCollections() {
  const session = useSession((state) => state.session);
  const activeAccountId = useSession((state) => state.activeAccountId);
  const activeGameId = useSession((state) => state.activeGameId);
  const provider = useSession((state) => state.catalogProvider);
  const queryKey = ['collections', activeAccountId, activeGameId, session?.mode ?? 'fixture'];
  const resourceKey = 'collections';
  const schemaVersion = 1;
  return useQuery({
    enabled: activeGameId === 'maimai',
    queryKey,
    queryFn: async () => {
      const service = new ResourceService(session ? repository : undefined);
      const loadFresh = () => service.load(resourceKey, schemaVersion, () => provider.getCollections());
      // 已登录时缓存优先：先渲染本地缓存，后台刷新成功后静默回写。
      if (session) {
        const cached = await service.getCached<CollectionSnapshot>(resourceKey, schemaVersion);
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
