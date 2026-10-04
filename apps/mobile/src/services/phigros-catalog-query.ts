import type { QueryClient } from '@tanstack/react-query';
import { phigrosResources } from './phigros-resources';
import type { CatalogSnapshot } from '@/domain/models';
import { mapPhigrosKyouAliases, type PhigrosKyouAliasesSnapshot } from '@/domain/phigros-kyou';
import { loadPhigrosKyouAliases } from './phigros-kyou-cache';
import { aliasedCatalogSource, loadAliasedCatalog, type AliasedCatalogOptions } from './aliased-catalog-query';
import { PhigrosCatalogProvider } from '@/providers/phigros-catalog-provider';
import { normalizeSearchText } from '@/utils/search';


export const PHIGROS_CATALOG_QUERY_KEY = ['phigros-catalog'] as const;

export const sharedProvider = new PhigrosCatalogProvider();

let catalogRevision: string | undefined;

export type PhigrosCatalogData = { snapshot: CatalogSnapshot; provider: PhigrosCatalogProvider };


function mergeAliasLists(existing: readonly string[] | undefined, incoming: readonly string[] | undefined): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const alias of [...(existing ?? []), ...(incoming ?? [])]) {
    const normalized = normalizeSearchText(alias.normalize('NFKC').trim());
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(alias.normalize('NFKC').trim());
  }
  return result;
}


export function phigrosCatalogOptions(
  queryClient: QueryClient,
  provider: PhigrosCatalogProvider,
  enabled?: boolean,
): AliasedCatalogOptions<CatalogSnapshot, PhigrosKyouAliasesSnapshot, PhigrosCatalogData> {
  return {
    enabled,
    retry: false,
    queryKey: PHIGROS_CATALOG_QUERY_KEY,
    loadCached: async () => null,
    loadCatalog: async (signal) => {
      const release = await phigrosResources.load(signal, true);
      const catalog = await provider.getCatalog(signal, true);
      if (catalogRevision !== release.revision) {
        catalogRevision = release.revision;
        void queryClient.invalidateQueries({
          predicate: (query) => query.queryKey[0] === 'game-data' && query.queryKey[3] === 'phigros',
        });
      }
      return catalog;
    },
    loadAliases: loadPhigrosKyouAliases,
    mergeAliases: (catalog, aliasSnapshot) => {
      if (!aliasSnapshot) return catalog;
      const aliases = new Map(mapPhigrosKyouAliases(aliasSnapshot, catalog).aliases
        .map((item) => [item.songId, item.aliases]));
      return {
        ...catalog,
        songs: catalog.songs.map((song) => ({
          ...song,
          aliases: mergeAliasLists(song.aliases, aliases.get(song.id)),
        })),
      };
    },
    composeSource: (catalog, aliasSnapshot) => aliasedCatalogSource(catalog, aliasSnapshot, {
      stale: '（含缓存别名）',
      aliasMissing: '（别名暂不可用）',
    }, { includeCatalogStale: false }),
    wrapData: (catalog) => ({ snapshot: catalog, provider }),
    onFresh: () => undefined,
  };
}


export function ensurePhigrosCatalog(queryClient: QueryClient, provider: PhigrosCatalogProvider): Promise<PhigrosCatalogData> {
  const options = phigrosCatalogOptions(queryClient, provider);
  return queryClient.fetchQuery({
    queryKey: PHIGROS_CATALOG_QUERY_KEY,
    queryFn: ({ signal }) => loadAliasedCatalog(options, signal),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  });
}


export async function refreshPhigrosCatalog(queryClient: QueryClient): Promise<PhigrosCatalogData> {
  await queryClient.invalidateQueries({ queryKey: PHIGROS_CATALOG_QUERY_KEY, refetchType: 'none' });
  return queryClient.fetchQuery({
    queryKey: PHIGROS_CATALOG_QUERY_KEY,
    queryFn: ({ signal }) => loadAliasedCatalog(phigrosCatalogOptions(queryClient, sharedProvider), signal),
    staleTime: Infinity, gcTime: Infinity, retry: false,
  });
}
