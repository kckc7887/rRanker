import { useMemo } from 'react';
import type { CatalogSnapshot } from '@/domain/models';
import {
  PHIGROS_CATALOG_RESOURCE_KEY,
  PHIGROS_CATALOG_SCHEMA_VERSION,
} from '@/domain/phigros';
import {
  mapPhigrosKyouAliases,
  PHIGROS_KYOU_ALIASES_RESOURCE_KEY,
  PHIGROS_KYOU_ALIASES_SCHEMA_VERSION,
  type PhigrosKyouAliasesSnapshot,
} from '@/domain/phigros-kyou';
import { loadPhigrosKyouAliases } from '@/hooks/use-phigros-kyou';
import { aliasedCatalogSource, useAliasedCatalog } from '@/hooks/use-aliased-catalog';
import { PhigrosCatalogProvider } from '@/providers/phigros-catalog-provider';
import { normalizeSearchText } from '@/utils/search';
import { useCachedTabActive } from '@/components/CachedTabScreen';
import { ResourceService } from '@/services/resource-service';
import { queryClient } from '@/state/query-client';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';

const repository = new SqliteSnapshotRepository();
const resourceService = new ResourceService(repository);

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

export function usePhigrosCatalog(enabled = true) {
  const tabActive = useCachedTabActive();
  const provider = useMemo(() => new PhigrosCatalogProvider(), []);
  const mergeAliases = (
    catalog: CatalogSnapshot,
    aliasSnapshot: PhigrosKyouAliasesSnapshot | null | undefined,
  ): CatalogSnapshot => {
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
  };
  return useAliasedCatalog<
    CatalogSnapshot,
    PhigrosKyouAliasesSnapshot,
    { snapshot: CatalogSnapshot; provider: PhigrosCatalogProvider }
  >({
    enabled: enabled && tabActive,
    queryKey: ['phigros-catalog'],
    loadCached: async () => {
      const [catalog, aliasSnapshot] = await Promise.all([
        resourceService.getCached<CatalogSnapshot>(
          PHIGROS_CATALOG_RESOURCE_KEY,
          PHIGROS_CATALOG_SCHEMA_VERSION,
        ),
        resourceService.getCached<PhigrosKyouAliasesSnapshot>(
          PHIGROS_KYOU_ALIASES_RESOURCE_KEY,
          PHIGROS_KYOU_ALIASES_SCHEMA_VERSION,
        ),
      ]);
      return catalog ? mergeAliases(catalog, aliasSnapshot) : null;
    },
    loadCatalog: () => {
      provider.resetCatalogCache();
      return resourceService.load(
        PHIGROS_CATALOG_RESOURCE_KEY,
        PHIGROS_CATALOG_SCHEMA_VERSION,
        () => provider.getCatalog(),
      );
    },
    loadAliases: loadPhigrosKyouAliases,
    mergeAliases,
    composeSource: (catalog, aliasSnapshot) => aliasedCatalogSource(catalog, aliasSnapshot, {
      stale: '（含缓存别名）',
      aliasMissing: '（别名暂不可用）',
    }),
    wrapData: (catalog) => ({ snapshot: catalog, provider }),
    onFresh: (fresh) => {
      queryClient.setQueryData(['phigros-catalog'], fresh);
    },
  });
}
