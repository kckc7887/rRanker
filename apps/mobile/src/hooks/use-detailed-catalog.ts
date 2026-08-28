import { useCallback, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AliasSnapshot, CatalogSnapshot, Song } from '@/domain/models';
import {
  aliasedCatalogSource,
  loadAliasedCatalog,
  useAliasedCatalog,
  type AliasedCatalogOptions,
} from '@/hooks/use-aliased-catalog';
import { UNBOUND_ACCOUNT_ID, useSession } from '@/state/session-store';
import { queryClient } from '@/state/query-client';
import { aliasesForCatalogSong } from '@/domain/catalog';
import { useCachedTabActive } from '@/components/CachedTabScreen';
import type { DetailedCatalogProvider } from '@/providers/contracts';

export const MAIMAI_CATALOG_QUERY_KEY = ['detailed-catalog', 'maimai', 2] as const;

function maimaiCatalogOptions(
  provider: DetailedCatalogProvider,
  enabled?: boolean,
): AliasedCatalogOptions<CatalogSnapshot, AliasSnapshot, CatalogSnapshot> {
  return {
    enabled,
    queryKey: MAIMAI_CATALOG_QUERY_KEY,
    loadCached: async () => null,
    loadCatalog: (signal) => provider.getCatalog(signal),
    loadAliases: (signal) => provider.getAliases(signal),
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
      queryClient.setQueryData(MAIMAI_CATALOG_QUERY_KEY, fresh);
    },
  };
}

export function ensureMaimaiCatalog(provider: DetailedCatalogProvider): Promise<CatalogSnapshot> {
  const options = maimaiCatalogOptions(provider);
  return queryClient.ensureQueryData({
    queryKey: MAIMAI_CATALOG_QUERY_KEY,
    queryFn: ({ signal }) => loadAliasedCatalog(options, signal),
    staleTime: Infinity,
    gcTime: Infinity,
    revalidateIfStale: false,
  });
}

/** 舞萌轻量曲库。无 hasCatalog 能力的游戏不会触发请求，避免复用舞萌缓存。 */
export function useDetailedCatalog(enabled = true) {
  const tabActive = useCachedTabActive();
  const activeAccountId = useSession((state) => state.activeAccountId);
  const activeGameId = useSession((state) => state.activeGameId);
  const provider = useSession((state) => state.catalogProvider);
  const canLoad = enabled && tabActive && activeGameId === 'maimai' && activeAccountId !== UNBOUND_ACCOUNT_ID;
  return useAliasedCatalog<CatalogSnapshot, AliasSnapshot>(maimaiCatalogOptions(provider, canLoad));
}

export function useMaimaiSongDetail(
  songId: string | undefined,
  catalog: CatalogSnapshot | undefined,
  enabled = true,
) {
  const activeGameId = useSession((state) => state.activeGameId);
  const provider = useSession((state) => state.catalogProvider);
  const normalizedSongId = songId?.trim();
  return useQuery<Song>({
    enabled: enabled && activeGameId === 'maimai' && !!normalizedSongId,
    queryKey: ['maimai-song-detail', normalizedSongId],
    queryFn: ({ signal }) => provider.getSong(normalizedSongId!, catalog, signal),
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
  });
}

type TransientDetailedCatalogState = {
  data: CatalogSnapshot | undefined;
  error: unknown;
  isLoading: boolean;
  refetch: () => void;
};

export function useTransientDetailedMaimaiCatalog(enabled = true): TransientDetailedCatalogState {
  const provider = useSession((state) => state.catalogProvider);
  const activeGameId = useSession((state) => state.activeGameId);
  const [attempt, setAttempt] = useState(0);
  const [data, setData] = useState<CatalogSnapshot>();
  const [error, setError] = useState<unknown>();
  const [isLoading, setIsLoading] = useState(false);
  const refetch = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    if (!enabled || activeGameId !== 'maimai') {
      setData(undefined);
      setError(undefined);
      setIsLoading(false);
      return;
    }
    let active = true;
    setData(undefined);
    setError(undefined);
    setIsLoading(true);
    void provider.getDetailedCatalog().then((catalog) => {
      if (!active) return;
      setData(catalog);
      setIsLoading(false);
    }, (loadError: unknown) => {
      if (!active) return;
      setError(loadError);
      setIsLoading(false);
    });
    return () => {
      active = false;
    };
  }, [activeGameId, attempt, enabled, provider]);

  return { data, error, isLoading, refetch };
}
