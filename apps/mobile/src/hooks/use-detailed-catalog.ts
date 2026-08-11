import { useQuery } from '@tanstack/react-query';
import type { CatalogSnapshot } from '@/domain/models';
import { ResourceService } from '@/services/resource-service';
import { cacheFirstLoad } from '@/services/cache-first';
import { UNBOUND_ACCOUNT_ID, useSession } from '@/state/session-store';
import { queryClient } from '@/state/query-client';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';
import { aliasesForCatalogSong } from '@/domain/catalog';

const repository = new SqliteSnapshotRepository();

/** 舞萌曲库。无 hasCatalog 能力的游戏不会触发请求，避免复用舞萌缓存。 */
export function useDetailedCatalog() {
  const activeAccountId = useSession((state) => state.activeAccountId);
  const activeGameId = useSession((state) => state.activeGameId);
  const provider = useSession((state) => state.catalogProvider);
  const enabled = activeGameId === 'maimai' && activeAccountId !== UNBOUND_ACCOUNT_ID;
  const queryKey = ['detailed-catalog', activeAccountId, activeGameId];
  return useQuery({
    enabled,
    queryKey,
    queryFn: async (): Promise<CatalogSnapshot> => {
      const service = new ResourceService(repository);
      const loadFresh = async (): Promise<CatalogSnapshot> => {
        const catalog = await service.load('detailed-catalog', 2, () => provider.getDetailedCatalog());
        const aliasResult = await Promise.allSettled([
          service.load('aliases', 1, () => provider.getAliases()),
        ]);
        const aliasSnapshot = aliasResult[0].status === 'fulfilled' ? aliasResult[0].value : undefined;
        const aliases = new Map(aliasSnapshot?.aliases.map((item) => [item.songId, item.aliases]) ?? []);
        return {
          ...catalog,
          songs: catalog.songs.map((song) => ({
            ...song,
            aliases: aliasesForCatalogSong(song.id, aliases),
          })),
          source: catalog.source.isStale || aliasSnapshot?.source.isStale
            ? { ...catalog.source, kind: 'cache', isStale: true, label: `${catalog.source.label}（含缓存资源）` }
            : !aliasSnapshot ? { ...catalog.source, label: `${catalog.source.label}（别名暂不可用）` } : catalog.source,
        };
      };
      // 曲库是账号无关的全局公开资源（示例账号 session 为空也命中缓存）：
      // 缓存优先，先渲染本地曲库快照，后台刷新成功后静默回写。
      return cacheFirstLoad({
        loadCached: () => service.getCached<CatalogSnapshot>('detailed-catalog', 2),
        loadFresh,
        onFresh: (fresh) => {
          queryClient.setQueryData(queryKey, fresh);
        },
      });
    },
  });
}
