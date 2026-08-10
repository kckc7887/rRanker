import { useQuery } from '@tanstack/react-query';
import {
  CHUNITHM_ALIAS_RESOURCE_KEY,
  CHUNITHM_CATALOG_RESOURCE_KEY,
  chunithmAliasesForSong,
  type ChunithmAliasSnapshot,
  type ChunithmCatalogSnapshot,
} from '@/domain/chunithm';
import {
  CHUNITHM_ALIAS_SCHEMA_VERSION,
  CHUNITHM_CATALOG_SCHEMA_VERSION,
  CHUNITHM_CATALOG_QUERY_KEY,
  loadChunithmAliases,
  loadChunithmCatalog,
} from '@/services/chunithm-catalog-loader';
import { cacheFirstLoad } from '@/services/cache-first';
import { ResourceService } from '@/services/resource-service';
import { useSession } from '@/state/session-store';
import { queryClient } from '@/state/query-client';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';

const repository = new SqliteSnapshotRepository();

/** 中二曲库。别名随曲库一并合并，供搜索与详情展示。曲库是账号无关的公开资源：缓存优先，先渲染本地快照，后台刷新成功静默回写。 */
export function useChunithmCatalog() {
  const activeGameId = useSession((state) => state.activeGameId);
  return useQuery({
    enabled: activeGameId === 'chunithm',
    queryKey: CHUNITHM_CATALOG_QUERY_KEY,
    queryFn: async (): Promise<ChunithmCatalogSnapshot> => {
      const service = new ResourceService(repository);
      const aliasesFrom = (snapshot: ChunithmAliasSnapshot | null | undefined) => (
        new Map(snapshot?.aliases.map((item) => [item.songId, item.aliases]) ?? [])
      );
      const mergeAliases = (
        catalog: ChunithmCatalogSnapshot,
        aliasSnapshot: ChunithmAliasSnapshot | null | undefined,
      ): ChunithmCatalogSnapshot => {
        const aliases = aliasesFrom(aliasSnapshot);
        return {
          ...catalog,
          songs: catalog.songs.map((song) => ({
            ...song,
            aliases: chunithmAliasesForSong(song.id, aliases),
          })),
        };
      };
      const loadFresh = async (): Promise<ChunithmCatalogSnapshot> => {
        const catalog = await loadChunithmCatalog();
        const aliasResult = await Promise.allSettled([loadChunithmAliases()]);
        const aliasSnapshot = aliasResult[0].status === 'fulfilled'
          ? aliasResult[0].value
          : undefined;
        const merged = mergeAliases(catalog, aliasSnapshot);
        return {
          ...merged,
          source: catalog.source.isStale || aliasSnapshot?.source.isStale
            ? {
                ...catalog.source,
                kind: 'cache',
                isStale: true,
                label: `${catalog.source.label}（含缓存资源）`,
              }
            : !aliasSnapshot
              ? { ...catalog.source, label: `${catalog.source.label}（别名暂不可用）` }
              : catalog.source,
        };
      };
      return cacheFirstLoad({
        loadCached: async (): Promise<ChunithmCatalogSnapshot | null> => {
          const [catalog, aliasSnapshot] = await Promise.all([
            service.getCached<ChunithmCatalogSnapshot>(
              CHUNITHM_CATALOG_RESOURCE_KEY,
              CHUNITHM_CATALOG_SCHEMA_VERSION,
            ),
            service.getCached<ChunithmAliasSnapshot>(
              CHUNITHM_ALIAS_RESOURCE_KEY,
              CHUNITHM_ALIAS_SCHEMA_VERSION,
            ),
          ]);
          if (!catalog) return null;
          return mergeAliases(catalog, aliasSnapshot);
        },
        loadFresh,
        onFresh: (fresh) => {
          queryClient.setQueryData(CHUNITHM_CATALOG_QUERY_KEY, fresh);
        },
      });
    },
  });
}
