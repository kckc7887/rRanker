import type { QueryClient } from '@tanstack/react-query';
import { chunithmAliasesForSong, type ChunithmAliasSnapshot, type ChunithmCatalogSnapshot } from '@/domain/chunithm';
import { CHUNITHM_CATALOG_QUERY_KEY, loadChunithmAliases, loadChunithmCatalog } from './chunithm-catalog-loader';
import { aliasedCatalogSource, loadAliasedCatalog, type AliasedCatalogOptions } from './aliased-catalog-query';
import { publishEntityValue } from './game-data-query';


function mergeChunithmAliases(
  catalog: ChunithmCatalogSnapshot,
  aliasSnapshot: ChunithmAliasSnapshot | null | undefined,
): ChunithmCatalogSnapshot {
  const aliases = new Map(aliasSnapshot?.aliases.map((item) => [item.songId, item.aliases]) ?? []);
  return {
    ...catalog,
    songs: catalog.songs.map((song) => ({
      ...song,
      aliases: chunithmAliasesForSong(song.id, aliases),
    })),
  };
}


export function chunithmCatalogOptions(
  queryClient: QueryClient,
  enabled?: boolean,
): AliasedCatalogOptions<ChunithmCatalogSnapshot, ChunithmAliasSnapshot, ChunithmCatalogSnapshot> {
  return {
    enabled,
    queryKey: CHUNITHM_CATALOG_QUERY_KEY,
    loadCached: async () => null,
    loadCatalog: loadChunithmCatalog,
    loadAliases: loadChunithmAliases,
    mergeAliases: mergeChunithmAliases,
    composeSource: (catalog, aliasSnapshot) => aliasedCatalogSource(catalog, aliasSnapshot, {
      stale: '（含缓存资源）',
      aliasMissing: '（别名暂不可用）',
    }),
    onFresh: (fresh) => {
      publishEntityValue(queryClient, CHUNITHM_CATALOG_QUERY_KEY, fresh);
    },
  };
}


export async function refreshChunithmCatalog(queryClient: QueryClient): Promise<ChunithmCatalogSnapshot> {
  const options = chunithmCatalogOptions(queryClient);
  await queryClient.invalidateQueries({ queryKey: CHUNITHM_CATALOG_QUERY_KEY, refetchType: 'none' });
  return queryClient.fetchQuery({
    queryKey: CHUNITHM_CATALOG_QUERY_KEY,
    queryFn: ({ signal }) => loadAliasedCatalog(options, signal),
    staleTime: Infinity,
  });
}


export function ensureChunithmCatalog(queryClient: QueryClient): Promise<ChunithmCatalogSnapshot> {
  const options = chunithmCatalogOptions(queryClient);
  return queryClient.ensureQueryData({
    queryKey: CHUNITHM_CATALOG_QUERY_KEY,
    queryFn: ({ signal }) => loadAliasedCatalog(options, signal),
    staleTime: Infinity,
    gcTime: Infinity,
    revalidateIfStale: false,
  });
}