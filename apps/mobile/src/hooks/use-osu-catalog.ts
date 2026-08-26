import { useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';
import { osuUserIdFromAccountId } from '@/domain/bound-account';
import type { OsuGameId } from '@/domain/game-mode-family';
import {
  isOsuCatalogHomeRequest,
  normalizeOsuCatalogSongs,
  type OsuBeatmapsetSearchParams,
  type OsuCatalogSong,
  type OsuCatalogHomePage,
  type OsuCatalogHomeRequest,
} from '@/domain/osu';
import { OsuScoreProvider } from '@/providers/osu-score-provider';
import type { OsuOAuthSession } from '@/providers/osu-oauth';
import { applyOsuTokenRotation, useSession } from '@/state/session-store';
import { useCachedTabActive } from '@/components/CachedTabScreen';
import { cacheFirstLoad } from '@/services/cache-first';
import { loadOsuCatalogHomeFresh, OsuCache } from '@/services/osu-cache';
import { queryClient } from '@/state/query-client';

const cache = new OsuCache();

/** 曲库搜索筛选状态（不含 gameId/cursor，由 hook 内部按当前游戏与翻页补齐）。 */
export type OsuCatalogSearchInput = OsuCatalogHomeRequest;

/** osu! 曲库搜索一页：50 份 beatmapset 归一化后的歌曲 + 上游 total/推荐难度/翻页游标。 */
export type OsuCatalogPage = OsuCatalogHomePage;

/**
 * osu! 曲库搜索（osu.ppy.sh 官方 API，仅默认第一页保留本地快照）：
 * - 仅 osu 会话（osu-oauth）可用，未绑定/非 osu 账号不发请求；
 * - m 参数由 buildOsuBeatmapsetSearchQuery 恒按当前游戏模式注入，玩家不可见；
 * - cursor_string 无限滚动，跨页按 beatmapSetId 去重（防翻页重叠）；
 * - token 轮换与 use-game-data 的 osu 分支同构（applyOsuTokenRotation 广播到共享凭据账号）。
 */
export function useOsuCatalogSearch(gameId: OsuGameId | null, input: OsuCatalogSearchInput, enabled = true) {
  const tabActive = useCachedTabActive();
  const session = useSession((s) => s.session);
  const activeProviderId = useSession((s) => s.activeProviderId);
  const activeAccountId = useSession((s) => s.activeAccountId);
  const userId = gameId === null ? null : osuUserIdFromAccountId(activeAccountId);
  const bound = activeProviderId === 'osu' && session?.mode === 'osu-oauth' && userId !== null;

  const params = useMemo<OsuBeatmapsetSearchParams | null>(
    () => (gameId === null ? null : { gameId, ...input }),
    // input 由调用方（曲库页）以逐字段依赖 useMemo 稳定身份，此处整体依赖即可。
    [gameId, input],
  );
  const queryKey = ['osu-catalog-search', gameId, userId, params] as const;

  const query = useInfiniteQuery({
    queryKey,
    queryFn: async ({ pageParam }): Promise<OsuCatalogPage> => {
      const provider = new OsuScoreProvider(
        session as OsuOAuthSession,
        (next) => applyOsuTokenRotation(activeAccountId, next),
      );
      if (gameId !== null && pageParam === undefined && isOsuCatalogHomeRequest(input)) {
        const snapshot = await cacheFirstLoad({
          loadCached: () => cache.loadCatalogHome(gameId),
          loadFresh: async () => {
            const fresh = await loadOsuCatalogHomeFresh(provider, gameId);
            await cache.saveCatalogHome(gameId, fresh);
            return fresh;
          },
          onFresh: (fresh) => {
            queryClient.setQueryData<InfiniteData<OsuCatalogPage>>(queryKey, (old) => {
              if (!old) return undefined;
              return { ...old, pages: old.pages.map((page, index) => (index === 0 ? fresh.data : page)) };
            });
          },
        });
        return snapshot.data;
      }
      const raw = await provider.searchBeatmapsets({
        ...(params as OsuBeatmapsetSearchParams),
        cursor: pageParam,
      });
      return {
        songs: normalizeOsuCatalogSongs(raw, (params as OsuBeatmapsetSearchParams).gameId),
        total: raw.total,
        recommendedDifficulty: raw.recommended_difficulty ?? null,
        cursor: raw.cursor_string ?? null,
      };
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.cursor ?? undefined,
    enabled: enabled && tabActive && bound && params !== null,
    staleTime: 60_000,
  });

  const songs = useMemo(() => {
    const seen = new Set<number>();
    const list: OsuCatalogSong[] = [];
    for (const page of query.data?.pages ?? []) {
      for (const song of page.songs) {
        if (seen.has(song.beatmapSetId)) continue;
        seen.add(song.beatmapSetId);
        list.push(song);
      }
    }
    return list;
  }, [query.data]);

  const total = query.data?.pages[0]?.total;
  const recommendedDifficulty = query.data?.pages[0]?.recommendedDifficulty ?? null;

  return {
    ...query,
    bound,
    songs,
    total,
    recommendedDifficulty,
  };
}
