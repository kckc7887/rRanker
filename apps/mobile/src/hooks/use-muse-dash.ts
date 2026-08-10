import { useQuery } from '@tanstack/react-query';
import type {
  MuseDashAlbumsResponse,
  MuseDashCeResponse,
  MuseDashDiffdiffEntry,
  MuseDashPlayer,
} from '@/domain/muse-dash';
import { museDashProvider } from '@/providers/muse-dash-provider';
import { cacheFirstLoad } from '@/services/cache-first';
import { queryClient } from '@/state/query-client';
import {
  loadMuseDashAlbumsFresh,
  loadMuseDashCeFresh,
  loadMuseDashDiffdiffFresh,
  loadMuseDashPlayerFresh,
  makeMuseDashSnapshot,
  MuseDashCache,
} from '@/services/muse-dash-cache';

const MUSE_DASH_QUERY_OPTIONS = { staleTime: 60_000, gcTime: 10 * 60_000 } as const;

const cache = new MuseDashCache();

/** 玩家搜索保持内存缓存（绑定流程即时交互，不落快照）。 */
export function useMuseDashSearch(query: string) {
  const normalized = query.trim();
  return useQuery({
    queryKey: ['musedash', 'players', 'search', normalized],
    queryFn: () => museDashProvider.searchPlayers(normalized),
    enabled: normalized.length > 0,
    ...MUSE_DASH_QUERY_OPTIONS,
  });
}

export function useMuseDashPlayer(userId: string | null) {
  const queryKey = ['musedash', 'player', userId] as const;
  return useQuery({
    queryKey,
    queryFn: async (): Promise<MuseDashPlayer> => {
      const snapshot = await cacheFirstLoad({
        loadCached: () => cache.loadPlayer(userId!),
        loadFresh: async () => {
          const player = await loadMuseDashPlayerFresh(userId!);
          const fresh = makeMuseDashSnapshot(player);
          void cache.savePlayer(userId!, fresh).catch(() => undefined);
          return fresh;
        },
        onFresh: (fresh) => {
          queryClient.setQueryData(queryKey, fresh.data);
        },
      });
      return snapshot.data;
    },
    enabled: userId !== null,
    ...MUSE_DASH_QUERY_OPTIONS,
  });
}

export function useMuseDashAlbums() {
  const queryKey = ['musedash', 'albums'] as const;
  return useQuery({
    queryKey,
    queryFn: async (): Promise<MuseDashAlbumsResponse> => {
      const snapshot = await cacheFirstLoad({
        loadCached: () => cache.loadAlbums(),
        loadFresh: async () => {
          const albums = await loadMuseDashAlbumsFresh();
          const fresh = makeMuseDashSnapshot(albums);
          void cache.saveAlbums(fresh).catch(() => undefined);
          return fresh;
        },
        onFresh: (fresh) => {
          queryClient.setQueryData(queryKey, fresh.data);
        },
      });
      return snapshot.data;
    },
    ...MUSE_DASH_QUERY_OPTIONS,
  });
}

export function useMuseDashCe() {
  const queryKey = ['musedash', 'ce'] as const;
  return useQuery({
    queryKey,
    queryFn: async (): Promise<MuseDashCeResponse> => {
      const snapshot = await cacheFirstLoad({
        loadCached: () => cache.loadCe(),
        loadFresh: async () => {
          const ce = await loadMuseDashCeFresh();
          const fresh = makeMuseDashSnapshot(ce);
          void cache.saveCe(fresh).catch(() => undefined);
          return fresh;
        },
        onFresh: (fresh) => {
          queryClient.setQueryData(queryKey, fresh.data);
        },
      });
      return snapshot.data;
    },
    ...MUSE_DASH_QUERY_OPTIONS,
  });
}

export function useMuseDashDiffdiff() {
  const queryKey = ['musedash', 'diffdiff'] as const;
  return useQuery({
    queryKey,
    queryFn: async (): Promise<MuseDashDiffdiffEntry[]> => {
      const snapshot = await cacheFirstLoad({
        loadCached: () => cache.loadDiffdiff(),
        loadFresh: async () => {
          const entries = await loadMuseDashDiffdiffFresh();
          const fresh = makeMuseDashSnapshot(entries);
          void cache.saveDiffdiff(fresh).catch(() => undefined);
          return fresh;
        },
        onFresh: (fresh) => {
          queryClient.setQueryData(queryKey, fresh.data);
        },
      });
      return snapshot.data;
    },
    ...MUSE_DASH_QUERY_OPTIONS,
  });
}
