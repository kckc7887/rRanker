import { useMemo } from 'react';
import { staleCached } from '@/services/cache-first';
import { phigrosResources } from '@/services/phigros-resources';
import type { CatalogSnapshot } from '@/domain/models';
import { mapPhigrosKyouAliases, type PhigrosKyouAliasesSnapshot } from '@/domain/phigros-kyou';
import { loadPhigrosKyouAliases } from '@/hooks/use-phigros-kyou';
import {
  aliasedCatalogSource,
  loadAliasedCatalog,
  useAliasedCatalog,
  type AliasedCatalogOptions,
} from '@/hooks/use-aliased-catalog';
import { PhigrosCatalogProvider } from '@/providers/phigros-catalog-provider';
import { normalizeSearchText } from '@/utils/search';
import { useCachedTabActive } from '@/components/CachedTabScreen';
import { queryClient } from '@/state/query-client';

export const PHIGROS_CATALOG_QUERY_KEY = ['phigros-catalog'] as const;
const sharedProvider = new PhigrosCatalogProvider();
let catalogRevision: string | undefined;
type PhigrosCatalogData = { snapshot: CatalogSnapshot; provider: PhigrosCatalogProvider };

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

function phigrosCatalogOptions(
  provider: PhigrosCatalogProvider,
  enabled?: boolean,
): AliasedCatalogOptions<CatalogSnapshot, PhigrosKyouAliasesSnapshot, PhigrosCatalogData> {
  return {
    enabled,
    retry: false,
    queryKey: PHIGROS_CATALOG_QUERY_KEY,
    // 曲库与已验证发布只保留在会话内，更新检查由所有页面共用。
    loadCached: async () => null,
    loadCatalog: async (signal) => {
      const release = await phigrosResources.load(signal, true);
      const catalog = await provider.getCatalog(signal);
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
    // 无本地缓存路径，cacheFirstLoad 不会触发后台回写。
    onFresh: () => undefined,
  };
}

export function ensurePhigrosCatalog(provider: PhigrosCatalogProvider): Promise<PhigrosCatalogData> {
  const options = phigrosCatalogOptions(provider);
  return queryClient.fetchQuery({
    queryKey: PHIGROS_CATALOG_QUERY_KEY,
    queryFn: ({ signal }) => loadAliasedCatalog(options, signal),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  });
}

export function usePhigrosCatalog(enabled = true) {
  const tabActive = useCachedTabActive();
  const provider = sharedProvider;
  const query = useAliasedCatalog<CatalogSnapshot, PhigrosKyouAliasesSnapshot, PhigrosCatalogData>(
    phigrosCatalogOptions(provider, enabled && tabActive),
  );
  const data = useMemo(() => query.isError && query.data ? {
    ...query.data, snapshot: { ...query.data.snapshot, source: staleCached(query.data.snapshot.source) },
  } : query.data, [query.data, query.isError]);
  return { ...query, data, isError: query.isError && !data };
}

export async function refreshPhigrosCatalog(): Promise<PhigrosCatalogData> {
  await queryClient.invalidateQueries({ queryKey: PHIGROS_CATALOG_QUERY_KEY, refetchType: 'none' });
  return queryClient.fetchQuery({
    queryKey: PHIGROS_CATALOG_QUERY_KEY,
    queryFn: ({ signal }) => loadAliasedCatalog(phigrosCatalogOptions(sharedProvider), signal),
    staleTime: Infinity, gcTime: Infinity, retry: false,
  });
}
