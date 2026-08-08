import { useQuery } from '@tanstack/react-query';
import type { CollectionSnapshot } from '@/domain/models';
import { ResourceService } from '@/services/resource-service';
import { cacheFirstLoad } from '@/services/cache-first';
import { useSession } from '@/state/session-store';
import { queryClient } from '@/state/query-client';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';

const repository = new SqliteSnapshotRepository();

/** 落雪称号/头像/姓名框/背景完整列表（含 required，账号无关的全局公开资源）。 */
export function useCollections() {
  const activeAccountId = useSession((state) => state.activeAccountId);
  const activeGameId = useSession((state) => state.activeGameId);
  const provider = useSession((state) => state.catalogProvider);
  const queryKey = ['collections', activeAccountId, activeGameId];
  const resourceKey = 'collections';
  const schemaVersion = 1;
  return useQuery({
    enabled: activeGameId === 'maimai',
    queryKey,
    queryFn: async () => {
      const service = new ResourceService(repository);
      const loadFresh = () => service.load(resourceKey, schemaVersion, () => provider.getCollections());
      // 缓存优先：先渲染本地缓存，后台刷新成功后静默回写。
      return cacheFirstLoad({
        loadCached: () => service.getCached<CollectionSnapshot>(resourceKey, schemaVersion),
        loadFresh,
        onFresh: (fresh) => {
          queryClient.setQueryData(queryKey, fresh);
        },
      });
    },
  });
}
