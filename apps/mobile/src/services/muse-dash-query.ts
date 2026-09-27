import type { QueryClient } from '@tanstack/react-query';
import type { DataSource } from '@/domain/models';
import type { MuseDashPlayer } from '@/domain/muse-dash';
import { isMuseDashTestUserId } from '@/domain/bound-account';
import { maxedMuseDashPlayerSnapshot } from '@/providers/maxed-musedash-test-provider';
import { cacheFirstLoad } from './cache-first';
import { captureResourceWrites } from './snapshot-cache-utils';
import { publishEntityValue } from './game-data-query';
import { loadMuseDashAlbumsFresh, loadMuseDashAlbumsFreshSnapshot, loadMuseDashDiffdiffFresh, loadMuseDashDiffdiffFreshSnapshot, loadMuseDashPlayerFresh, makeMuseDashSnapshot, MuseDashCache } from './muse-dash-cache';
const cache = new MuseDashCache();


export const MUSE_DASH_QUERY_OPTIONS = { staleTime: 60_000, gcTime: 10 * 60_000 } as const;

export const MUSE_DASH_SESSION_RESOURCE_QUERY_OPTIONS = {
  staleTime: Infinity,
  gcTime: Infinity,
  refetchOnMount: false,
  refetchOnReconnect: false,
} as const;


function museDashSessionResourceQueryOptions<T>(
  queryKey: readonly unknown[],
  load: (signal: AbortSignal) => Promise<T>,
) {
  return {
    queryKey,
    queryFn: async ({ signal }: { signal: AbortSignal }): Promise<MuseDashSnapshot<T>> => (
      makeMuseDashSnapshot(await load(signal))
    ),
    ...MUSE_DASH_SESSION_RESOURCE_QUERY_OPTIONS,
  } as const;
}


export async function refreshMuseDashSessionResources(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({ predicate: query => query.queryKey[0] === 'musedash' && ['albums', 'ce', 'diffdiff'].includes(String(query.queryKey[1])), refetchType: 'none' });
}


export function ensureMuseDashAlbums(queryClient: QueryClient) {
  return queryClient.ensureQueryData(museDashSessionResourceQueryOptions(
    ['musedash', 'albums'],
    loadMuseDashAlbumsFresh,
  ));
}


export function ensureMuseDashDiffdiff(queryClient: QueryClient) {
  return queryClient.ensureQueryData(museDashSessionResourceQueryOptions(
    ['musedash', 'diffdiff'],
    loadMuseDashDiffdiffFresh,
  ));
}


export type MuseDashSnapshot<T> = { data: T; source: DataSource };


/** Muse Dash 玩家实体的规范键：总览数据包与页面读到同一份版本。 */
export function museDashPlayerEntityKey(userId: string) {
  return ['musedash', 'player', userId] as const;
}


/** 该玩家实体的规范查询选项：随机歌曲页与总览派生视图共用。 */
export function museDashPlayerQueryOptions(queryClient: QueryClient, userId: string) {
  const queryKey = museDashPlayerEntityKey(userId);
  return {
    queryKey,
    queryFn: async ({ signal }: { signal: AbortSignal }): Promise<MuseDashSnapshot<MuseDashPlayer>> => {
      // 示例账号：不请求网络玩家资料，由曲库与定数表缓存优先生成全满成绩。
      if (isMuseDashTestUserId(userId)) {
        const [albums, diffdiff] = await Promise.all([
          loadMuseDashAlbumsFreshSnapshot(signal),
          loadMuseDashDiffdiffFreshSnapshot(signal),
        ]);
        return maxedMuseDashPlayerSnapshot(albums.data, diffdiff.data);
      }
      const assertCurrent = captureResourceWrites('musedash', signal, `musedash:musedash-moe:${userId}`);
      return cacheFirstLoad({
        assertCurrent,
        loadCached: () => cache.loadPlayer(userId),
        loadFresh: async () => {
          const player = await loadMuseDashPlayerFresh(userId, signal);
          const fresh = makeMuseDashSnapshot(player);
          if (!signal.aborted) void cache.savePlayer(userId, fresh, assertCurrent).catch(() => undefined);
          return fresh;
        },
        onFresh: (fresh) => {
          return publishEntityValue(queryClient, queryKey, fresh, assertCurrent);
        },
        signal,
      });
    },
    ...MUSE_DASH_QUERY_OPTIONS,
  };
}