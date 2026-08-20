import { useQuery } from '@tanstack/react-query';
import type { PlateSnapshot } from '@/domain/models';
import { ResourceService } from '@/services/resource-service';
import { cacheFirstLoad } from '@/services/cache-first';
import { useSession } from '@/state/session-store';
import { queryClient } from '@/state/query-client';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';

const repository = new SqliteSnapshotRepository();

/** 仅舞萌姓名框（账号无关的全局公开资源，示例账号也命中缓存优先）。 */
export function usePlates(enabled = true) {
  const activeAccountId = useSession((state) => state.activeAccountId);
  const activeGameId = useSession((state) => state.activeGameId);
  const provider = useSession((state) => state.catalogProvider);
  const queryKey = ['plates', activeAccountId, activeGameId];
  const resourceKey = 'plates';
  const schemaVersion = 2;
  return useQuery({
    enabled: enabled && activeGameId === 'maimai',
    queryKey,
    queryFn: async () => {
      const service = new ResourceService(repository);
      const loadFresh = () => service.load(resourceKey, schemaVersion, () => provider.getPlates());
      // 缓存优先：先渲染本地缓存，后台刷新成功后静默回写。
      return cacheFirstLoad({
        loadCached: () => service.getCached<PlateSnapshot>(resourceKey, schemaVersion),
        loadFresh,
        onFresh: (fresh) => {
          queryClient.setQueryData(queryKey, fresh);
        },
      });
    },
  });
}
