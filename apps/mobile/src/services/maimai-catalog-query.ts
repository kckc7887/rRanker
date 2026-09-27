import type { QueryClient } from '@tanstack/react-query';
import type { AliasSnapshot, CatalogSnapshot } from '@/domain/models';
import { requireDetailedCatalogProvider, type DetailedCatalogProvider } from '@/providers/contracts';
import { aliasedCatalogSource, loadAliasedCatalog, type AliasedCatalogOptions } from './aliased-catalog-query';
import { aliasesForCatalogSong } from '@/domain/catalog';
import { publishEntityValue } from './game-data-query';


export const MAIMAI_CATALOG_QUERY_KEY = ['detailed-catalog', 'maimai', 2] as const;


export function maimaiCatalogOptions(
  queryClient: QueryClient,
  provider: DetailedCatalogProvider | null,
  enabled?: boolean,
): AliasedCatalogOptions<CatalogSnapshot, AliasSnapshot, CatalogSnapshot> {
  return {
    enabled: enabled !== false && provider !== null,
    queryKey: MAIMAI_CATALOG_QUERY_KEY,
    loadCached: async () => null,
    loadCatalog: (signal) => requireDetailedCatalogProvider(provider).getCatalog(signal),
    loadAliases: (signal) => requireDetailedCatalogProvider(provider).getAliases(signal),
    mergeAliases: (catalog, aliasSnapshot) => {
      const aliases = new Map(aliasSnapshot?.aliases.map((item) => [item.songId, item.aliases]) ?? []);
      return {
        ...catalog,
        songs: catalog.songs.map((song) => ({
          ...song,
          aliases: aliasesForCatalogSong(song.id, aliases),
        })),
      };
    },
    composeSource: (catalog, aliasSnapshot) => aliasedCatalogSource(catalog, aliasSnapshot, {
      stale: '（含缓存资源）',
      aliasMissing: '（别名暂不可用）',
    }),
    onFresh: (fresh) => {
      return publishEntityValue(queryClient, MAIMAI_CATALOG_QUERY_KEY, fresh);
    },
  };
}


export async function refreshMaimaiCatalog(
  queryClient: QueryClient,
  provider: DetailedCatalogProvider | null,
): Promise<CatalogSnapshot> {
  requireDetailedCatalogProvider(provider);
  await queryClient.invalidateQueries({ queryKey: MAIMAI_CATALOG_QUERY_KEY, refetchType: 'none' });
  return queryClient.fetchQuery({
    queryKey: MAIMAI_CATALOG_QUERY_KEY,
    queryFn: ({ signal }) => loadAliasedCatalog(maimaiCatalogOptions(queryClient, provider), signal),
    staleTime: Infinity,
  });
}


export function ensureMaimaiCatalog(queryClient: QueryClient, provider: DetailedCatalogProvider): Promise<CatalogSnapshot> {
  const options = maimaiCatalogOptions(queryClient, provider);
  return queryClient.ensureQueryData({
    queryKey: MAIMAI_CATALOG_QUERY_KEY,
    queryFn: ({ signal }) => loadAliasedCatalog(options, signal),
    staleTime: Infinity,
    gcTime: Infinity,
    revalidateIfStale: false,
  });
}