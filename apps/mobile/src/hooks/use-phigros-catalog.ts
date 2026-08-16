import { useMemo } from 'react';
import type { CatalogSnapshot } from '@/domain/models';
import { mapPhigrosKyouAliases, type PhigrosKyouAliasesSnapshot } from '@/domain/phigros-kyou';
import { loadPhigrosKyouAliases } from '@/hooks/use-phigros-kyou';
import { aliasedCatalogSource, useAliasedCatalog } from '@/hooks/use-aliased-catalog';
import { PhigrosCatalogProvider } from '@/providers/phigros-catalog-provider';
import { normalizeSearchText } from '@/utils/search';

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

export function usePhigrosCatalog() {
  const provider = useMemo(() => new PhigrosCatalogProvider(), []);
  return useAliasedCatalog<
    CatalogSnapshot,
    PhigrosKyouAliasesSnapshot,
    { snapshot: CatalogSnapshot; provider: PhigrosCatalogProvider }
  >({
    queryKey: ['phigros-catalog'],
    // Phigros 曲库由 provider 内存缓存承载（resetCatalogCache 后重拉 OSS），无本地持久化快照。
    loadCached: async () => null,
    loadCatalog: () => {
      provider.resetCatalogCache();
      return provider.getCatalog();
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
  });
}
