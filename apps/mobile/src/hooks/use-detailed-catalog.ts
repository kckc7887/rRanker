import type { AliasSnapshot, CatalogSnapshot } from '@/domain/models';
import { ResourceService } from '@/services/resource-service';
import { aliasedCatalogSource, useAliasedCatalog } from '@/hooks/use-aliased-catalog';
import { UNBOUND_ACCOUNT_ID, useSession } from '@/state/session-store';
import { queryClient } from '@/state/query-client';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';
import { aliasesForCatalogSong } from '@/domain/catalog';

const repository = new SqliteSnapshotRepository();

/** 舞萌曲库。无 hasCatalog 能力的游戏不会触发请求，避免复用舞萌缓存。 */
export function useDetailedCatalog() {
  const activeAccountId = useSession((state) => state.activeAccountId);
  const activeGameId = useSession((state) => state.activeGameId);
  const provider = useSession((state) => state.catalogProvider);
  const enabled = activeGameId === 'maimai' && activeAccountId !== UNBOUND_ACCOUNT_ID;
  const queryKey = ['detailed-catalog', activeAccountId, activeGameId];
  return useAliasedCatalog<CatalogSnapshot, AliasSnapshot>({
    enabled,
    queryKey,
    // 曲库是账号无关的全局公开资源（示例账号 session 为空也命中缓存）：
    // 缓存优先，先渲染本地曲库快照，后台刷新成功后静默回写。
    loadCached: () => new ResourceService(repository).getCached<CatalogSnapshot>('detailed-catalog', 2),
    loadCatalog: () => new ResourceService(repository).load('detailed-catalog', 2, () => provider.getDetailedCatalog()),
    loadAliases: () => new ResourceService(repository).load('aliases', 1, () => provider.getAliases()),
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
