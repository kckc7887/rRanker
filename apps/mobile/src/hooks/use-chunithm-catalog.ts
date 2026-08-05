import { useQuery } from '@tanstack/react-query';
import { chunithmAliasesForSong, type ChunithmCatalogSnapshot } from '@/domain/chunithm';
import {
  CHUNITHM_CATALOG_QUERY_KEY,
  loadChunithmAliases,
  loadChunithmCatalog,
} from '@/services/chunithm-catalog-loader';
import { useSession } from '@/state/session-store';

/** 中二曲库。别名随曲库一并合并，供搜索与详情展示。 */
export function useChunithmCatalog() {
  const activeGameId = useSession((state) => state.activeGameId);
  return useQuery({
    enabled: activeGameId === 'chunithm',
    queryKey: CHUNITHM_CATALOG_QUERY_KEY,
    queryFn: async (): Promise<ChunithmCatalogSnapshot> => {
      const catalog = await loadChunithmCatalog();
      const aliasResult = await Promise.allSettled([loadChunithmAliases()]);
      const aliasSnapshot = aliasResult[0].status === 'fulfilled'
        ? aliasResult[0].value
        : undefined;
      const aliases = new Map(
        aliasSnapshot?.aliases.map((item) => [item.songId, item.aliases]) ?? [],
      );
      return {
        ...catalog,
        songs: catalog.songs.map((song) => ({
          ...song,
          aliases: chunithmAliasesForSong(song.id, aliases),
        })),
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
    },
  });
}
