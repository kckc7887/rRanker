import type { AliasSnapshot, CatalogSnapshot, Song } from '@/domain/models';
import { useAliasedCatalog } from '@/hooks/use-aliased-catalog';
import { maimaiCatalogOptions } from '@/services/maimai-catalog-query';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';

import { queryClient } from '@/state/query-client';
import { UNBOUND_ACCOUNT_ID, useSession } from '@/state/session-store';

import { useCachedTabActive } from '@/components/CachedTabScreen';
import { requireDetailedCatalogProvider } from '@/providers/contracts';

/** 舞萌轻量曲库。只有当前游戏是舞萌且已绑定账号时才触发请求，其它游戏不会复用舞萌缓存。 */
export function useDetailedCatalog(enabled = true) {
  const tabActive = useCachedTabActive();
  const activeAccountId = useSession((state) => state.activeAccountId);
  const activeGameId = useSession((state) => state.activeGameId);
  const provider = useSession((state) => state.catalogProvider);
  const canLoad = enabled && tabActive && activeGameId === 'maimai' && activeAccountId !== UNBOUND_ACCOUNT_ID;
  return useAliasedCatalog<CatalogSnapshot, AliasSnapshot>(maimaiCatalogOptions(queryClient, provider, canLoad));
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
    enabled: enabled && activeGameId === 'maimai' && !!normalizedSongId && provider !== null,
    queryKey: ['maimai-song-detail', normalizedSongId],
    queryFn: ({ signal }) => requireDetailedCatalogProvider(provider).getSong(normalizedSongId!, catalog, signal),
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
    if (!enabled || activeGameId !== 'maimai' || !provider) {
      setData(undefined);
      setError(undefined);
      setIsLoading(false);
      return;
    }
    let active = true;
    const controller = new AbortController();
    setData(undefined);
    setError(undefined);
    setIsLoading(true);
    void provider.getDetailedCatalog(controller.signal).then((catalog) => {
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
      controller.abort();
    };
  }, [activeGameId, attempt, enabled, provider]);

  return { data, error, isLoading, refetch };
}
