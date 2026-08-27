import {
  chunithmAliasesForSong,
  type ChunithmAliasSnapshot,
  type ChunithmCatalogSnapshot,
} from '@/domain/chunithm';
import {
  CHUNITHM_CATALOG_QUERY_KEY,
  loadChunithmAliases,
  loadChunithmCatalog,
} from '@/services/chunithm-catalog-loader';
import { aliasedCatalogSource, useAliasedCatalog } from '@/hooks/use-aliased-catalog';
import { useSession } from '@/state/session-store';
import { queryClient } from '@/state/query-client';
import { useCachedTabActive } from '@/components/CachedTabScreen';

/** 中二曲库。别名随曲库一并合并，供当前会话内的搜索与详情展示。 */
export function useChunithmCatalog(enabled = true) {
  const tabActive = useCachedTabActive();
  const activeGameId = useSession((state) => state.activeGameId);
  const mergeAliases = (
    catalog: ChunithmCatalogSnapshot,
    aliasSnapshot: ChunithmAliasSnapshot | null | undefined,
  ): ChunithmCatalogSnapshot => {
    const aliases = new Map(aliasSnapshot?.aliases.map((item) => [item.songId, item.aliases]) ?? []);
    return {
      ...catalog,
      songs: catalog.songs.map((song) => ({
        ...song,
        aliases: chunithmAliasesForSong(song.id, aliases),
      })),
    };
  };
  return useAliasedCatalog<ChunithmCatalogSnapshot, ChunithmAliasSnapshot>({
    enabled: enabled && tabActive && activeGameId === 'chunithm',
    queryKey: CHUNITHM_CATALOG_QUERY_KEY,
    loadCached: async (): Promise<ChunithmCatalogSnapshot | null> => null,
    loadCatalog: loadChunithmCatalog,
    loadAliases: loadChunithmAliases,
    mergeAliases,
    composeSource: (catalog, aliasSnapshot) => aliasedCatalogSource(catalog, aliasSnapshot, {
      stale: '（含缓存资源）',
      aliasMissing: '（别名暂不可用）',
    }),
    onFresh: (fresh) => {
      queryClient.setQueryData(CHUNITHM_CATALOG_QUERY_KEY, fresh);
    },
  });
}
