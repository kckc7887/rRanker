import type { AliasSnapshot, CatalogSnapshot } from '@/domain/models';
import { aliasedCatalogSource, useAliasedCatalog } from '@/hooks/use-aliased-catalog';
import { UNBOUND_ACCOUNT_ID, useSession } from '@/state/session-store';
import { queryClient } from '@/state/query-client';
import { aliasesForCatalogSong } from '@/domain/catalog';
import { useCachedTabActive } from '@/components/CachedTabScreen';

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
    // 全量公开曲库仅由 React Query 保持在当前会话，避免重启后长期占用磁盘。
    loadCached: async () => null,
    loadCatalog: () => provider.getDetailedCatalog(),
    loadAliases: () => provider.getAliases(),
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
