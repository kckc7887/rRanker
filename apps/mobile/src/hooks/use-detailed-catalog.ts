import type { AliasSnapshot, CatalogSnapshot } from '@/domain/models';
import { aliasedCatalogSource, useAliasedCatalog } from '@/hooks/use-aliased-catalog';
import { CatalogService } from '@/services/catalog-service';
import { ResourceService } from '@/services/resource-service';
import { UNBOUND_ACCOUNT_ID, useSession } from '@/state/session-store';
import { queryClient } from '@/state/query-client';
import { aliasesForCatalogSong } from '@/domain/catalog';
import { useCachedTabActive } from '@/components/CachedTabScreen';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';

const repository = new SqliteSnapshotRepository();
const resourceService = new ResourceService(repository);
const MAIMAI_ALIAS_RESOURCE_KEY = 'aliases';
const MAIMAI_ALIAS_SCHEMA_VERSION = 1;

/** 舞萌曲库。无 hasCatalog 能力的游戏不会触发请求，避免复用舞萌缓存。 */
export function useDetailedCatalog(enabled = true) {
  const tabActive = useCachedTabActive();
  const activeAccountId = useSession((state) => state.activeAccountId);
  const activeGameId = useSession((state) => state.activeGameId);
  const provider = useSession((state) => state.catalogProvider);
  const canLoad = enabled && tabActive && activeGameId === 'maimai' && activeAccountId !== UNBOUND_ACCOUNT_ID;
  const queryKey = ['detailed-catalog', activeAccountId, activeGameId];
  return useAliasedCatalog<CatalogSnapshot, AliasSnapshot>({
    enabled: canLoad,
    queryKey,
    loadCached: async () => {
      const [catalog, aliasSnapshot] = await Promise.all([
        repository.getLatestCatalog(),
        resourceService.getCached<AliasSnapshot>(MAIMAI_ALIAS_RESOURCE_KEY, MAIMAI_ALIAS_SCHEMA_VERSION),
      ]);
      if (!catalog) return null;
      const aliases = new Map(aliasSnapshot?.aliases.map((item) => [item.songId, item.aliases]) ?? []);
      return {
        ...catalog,
        songs: catalog.songs.map((song) => ({
          ...song,
          aliases: aliasesForCatalogSong(song.id, aliases),
        })),
      };
    },
    loadCatalog: () => new CatalogService(
      { getCatalog: () => provider.getDetailedCatalog() },
      repository,
    ).load(),
    loadAliases: () => resourceService.load(
      MAIMAI_ALIAS_RESOURCE_KEY,
      MAIMAI_ALIAS_SCHEMA_VERSION,
      () => provider.getAliases(),
    ),
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
      queryClient.setQueryData(queryKey, fresh);
    },
  });
}
