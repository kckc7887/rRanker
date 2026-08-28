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
import {
  aliasedCatalogSource,
  loadAliasedCatalog,
  useAliasedCatalog,
  type AliasedCatalogOptions,
} from '@/hooks/use-aliased-catalog';
import { useSession } from '@/state/session-store';
import { queryClient } from '@/state/query-client';
import { useCachedTabActive } from '@/components/CachedTabScreen';

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

function chunithmCatalogOptions(
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
      queryClient.setQueryData(CHUNITHM_CATALOG_QUERY_KEY, fresh);
    },
  };
}

export function ensureChunithmCatalog(): Promise<ChunithmCatalogSnapshot> {
  const options = chunithmCatalogOptions();
  return queryClient.ensureQueryData({
    queryKey: CHUNITHM_CATALOG_QUERY_KEY,
    queryFn: ({ signal }) => loadAliasedCatalog(options, signal),
    staleTime: Infinity,
    gcTime: Infinity,
    revalidateIfStale: false,
  });
}

/** 中二曲库。别名随曲库一并合并，供当前会话内的搜索与详情展示。 */
export function useChunithmCatalog(enabled = true) {
  const tabActive = useCachedTabActive();
  const activeGameId = useSession((state) => state.activeGameId);
  return useAliasedCatalog<ChunithmCatalogSnapshot, ChunithmAliasSnapshot>(
    chunithmCatalogOptions(enabled && tabActive && activeGameId === 'chunithm'),
  );
}
