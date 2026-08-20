import { useMemo } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import type { DataSource } from '@/domain/models';
import type {
  MuseDashAlbumsResponse,
  MuseDashCeResponse,
  MuseDashDiffdiffEntry,
  MuseDashPlayDetail,
  MuseDashPlayer,
} from '@/domain/muse-dash';
import { isMuseDashTestUserId } from '@/domain/bound-account';
import { museDashProvider } from '@/providers/muse-dash-provider';
import {
  maxedMuseDashPlayDetailSnapshot,
  maxedMuseDashPlayerSnapshot,
} from '@/providers/maxed-musedash-test-provider';
import { cacheFirstLoad } from '@/services/cache-first';
import { queryClient } from '@/state/query-client';
import {
  loadMuseDashAlbumsCacheFirst,
  loadMuseDashAlbumsFresh,
  loadMuseDashCeFresh,
  loadMuseDashDiffdiffCacheFirst,
  loadMuseDashDiffdiffFresh,
  loadMuseDashPlayDetailFresh,
  loadMuseDashPlayerFresh,
  makeMuseDashSnapshot,
  MuseDashCache,
} from '@/services/muse-dash-cache';

const MUSE_DASH_QUERY_OPTIONS = { staleTime: 60_000, gcTime: 10 * 60_000 } as const;

const cache = new MuseDashCache();

/** Muse Dash 查询统一返回：data 为原始数据，source 为缓存快照来源（数据状态展示用）。 */
export type MuseDashQuery<T> = {
  data: T | undefined;
  source: DataSource | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  isFetching: boolean;
  refetch: () => Promise<unknown>;
};

type MuseDashSnapshot<T> = { data: T; source: DataSource };

function useMuseDashCacheFirst<T>(
  queryKey: readonly unknown[],
  load: () => Promise<MuseDashSnapshot<T>>,
  enabled = true,
): MuseDashQuery<T> {
  const query = useQuery({
    queryKey,
    queryFn: load,
    enabled,
    ...MUSE_DASH_QUERY_OPTIONS,
  });
  const snapshot = query.data as MuseDashSnapshot<T> | undefined;
  return {
    data: snapshot?.data,
    source: snapshot?.source,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error as Error | null,
    isFetching: query.isFetching,
    refetch: query.refetch,
  };
}

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
  return useMuseDashCacheFirst<MuseDashPlayer>(queryKey, async () => {
    // 示例账号：不请求网络玩家资料，由曲库与定数表缓存优先生成全满成绩。
    if (userId !== null && isMuseDashTestUserId(userId)) {
      const [albums, diffdiff] = await Promise.all([
        loadMuseDashAlbumsCacheFirst(cache),
        loadMuseDashDiffdiffCacheFirst(cache),
      ]);
      return maxedMuseDashPlayerSnapshot(albums.data, diffdiff.data);
    }
    const snapshot = await cacheFirstLoad({
      loadCached: () => cache.loadPlayer(userId!),
      loadFresh: async () => {
        const player = await loadMuseDashPlayerFresh(userId!);
        const fresh = makeMuseDashSnapshot(player);
        void cache.savePlayer(userId!, fresh).catch(() => undefined);
        return fresh;
      },
      onFresh: (fresh) => {
        queryClient.setQueryData(queryKey, fresh);
      },
    });
    return snapshot;
  }, userId !== null);
}

/** 单曲原始成绩明细（成就判定需要 miss 数）；按玩家+歌曲+难度+平台缓存优先，列表卡片懒加载。 */
export function useMuseDashPlayDetail(
  uid: string | null,
  difficulty: number | null,
  platform: string | null,
  userId: string | null,
) {
  const enabled = uid !== null && difficulty !== null && platform !== null && userId !== null;
  const queryKey = ['musedash', 'play-detail', userId, uid, difficulty, platform] as const;
  return useMuseDashCacheFirst<MuseDashPlayDetail>(queryKey, async () => {
    // 示例账号：全 AP（miss 0）直接生成，不请求 /rank 明细。
    if (userId !== null && isMuseDashTestUserId(userId)) {
      return maxedMuseDashPlayDetailSnapshot();
    }
    const snapshot = await cacheFirstLoad({
      loadCached: () => cache.loadPlayDetail(userId!, uid!, difficulty!, platform!),
      loadFresh: async () => {
        const detail = await loadMuseDashPlayDetailFresh(uid!, difficulty!, platform!, userId!);
        const fresh = makeMuseDashSnapshot(detail);
        void cache.savePlayDetail(userId!, uid!, difficulty!, platform!, fresh).catch(() => undefined);
        return fresh;
      },
      onFresh: (fresh) => {
        queryClient.setQueryData(queryKey, fresh);
      },
    });
    return snapshot;
  }, enabled);
}

/** 批量单曲明细 miss 表（成就筛选用）：key = `${uid}:${difficulty}` → miss。
 * 与 useMuseDashPlayDetail 共用同一 queryKey 且 queryFn 返回结构一致（完整快照），
 * 同 Key 查询无论由哪个 observer 执行，缓存 data 均为 `{ data, source }`，读取处解包 `data.data.play?.miss`。 */
export function useMuseDashPlayDetails(
  items: readonly { uid: string; difficulty: number; platform: string }[],
  userId: string | null,
  enabled: boolean,
): ReadonlyMap<string, number | undefined> {
  const queryDefs = useMemo(() => items.map((item) => ({
    queryKey: ['musedash', 'play-detail', userId, item.uid, item.difficulty, item.platform] as const,
    queryFn: async (): Promise<MuseDashSnapshot<MuseDashPlayDetail>> => {
      if (userId !== null && isMuseDashTestUserId(userId)) {
        return maxedMuseDashPlayDetailSnapshot();
      }
      const queryKey = ['musedash', 'play-detail', userId, item.uid, item.difficulty, item.platform] as const;
      const snapshot = await cacheFirstLoad({
        loadCached: () => cache.loadPlayDetail(userId!, item.uid, item.difficulty, item.platform),
        loadFresh: async () => {
          const detail = await loadMuseDashPlayDetailFresh(item.uid, item.difficulty, item.platform, userId!);
          const fresh = makeMuseDashSnapshot(detail);
          void cache.savePlayDetail(userId!, item.uid, item.difficulty, item.platform, fresh).catch(() => undefined);
          return fresh;
        },
        onFresh: (fresh) => {
          queryClient.setQueryData(queryKey, fresh);
        },
      });
      return snapshot;
    },
    enabled: enabled && userId !== null,
    ...MUSE_DASH_QUERY_OPTIONS,
  })), [items, userId, enabled]);
  const queries = useQueries({ queries: queryDefs });
  return useMemo(() => {
    const map = new Map<string, number | undefined>();
    const count = Math.min(items.length, queries.length);
    for (let index = 0; index < count; index += 1) {
      const item = items[index];
      const query = queries[index];
      if (item && query) map.set(`${item.uid}:${item.difficulty}`, query.data?.data?.play?.miss);
    }
    return map;
  }, [items, queries]);
}

export function useMuseDashAlbums(enabled = true) {
  const queryKey = ['musedash', 'albums'] as const;
  return useMuseDashCacheFirst<MuseDashAlbumsResponse>(queryKey, async () => {
    const snapshot = await cacheFirstLoad({
      loadCached: () => cache.loadAlbums(),
      loadFresh: async () => {
        const albums = await loadMuseDashAlbumsFresh();
        const fresh = makeMuseDashSnapshot(albums);
        void cache.saveAlbums(fresh).catch(() => undefined);
        return fresh;
      },
      onFresh: (fresh) => {
        queryClient.setQueryData(queryKey, fresh);
      },
    });
    return snapshot;
  }, enabled);
}

export function useMuseDashCe() {
  const queryKey = ['musedash', 'ce'] as const;
  return useMuseDashCacheFirst<MuseDashCeResponse>(queryKey, async () => {
    const snapshot = await cacheFirstLoad({
      loadCached: () => cache.loadCe(),
      loadFresh: async () => {
        const ce = await loadMuseDashCeFresh();
        const fresh = makeMuseDashSnapshot(ce);
        void cache.saveCe(fresh).catch(() => undefined);
        return fresh;
      },
      onFresh: (fresh) => {
        queryClient.setQueryData(queryKey, fresh);
      },
    });
    return snapshot;
  });
}

export function useMuseDashDiffdiff() {
  const queryKey = ['musedash', 'diffdiff'] as const;
  return useMuseDashCacheFirst<MuseDashDiffdiffEntry[]>(queryKey, async () => {
    const snapshot = await cacheFirstLoad({
      loadCached: () => cache.loadDiffdiff(),
      loadFresh: async () => {
        const entries = await loadMuseDashDiffdiffFresh();
        const fresh = makeMuseDashSnapshot(entries);
        void cache.saveDiffdiff(fresh).catch(() => undefined);
        return fresh;
      },
      onFresh: (fresh) => {
        queryClient.setQueryData(queryKey, fresh);
      },
    });
    return snapshot;
  });
}
