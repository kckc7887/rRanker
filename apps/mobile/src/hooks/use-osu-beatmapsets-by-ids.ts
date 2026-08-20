import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { osuUserIdFromAccountId } from '@/domain/bound-account';
import type { OsuGameId } from '@/domain/game-mode-family';
import { normalizeOsuBeatmapsetDetail, type OsuBeatmapsetDetail } from '@/domain/osu';
import { OsuScoreProvider } from '@/providers/osu-score-provider';
import type { OsuOAuthSession } from '@/providers/osu-oauth';
import { applyOsuTokenRotation, useSession } from '@/state/session-store';

/**
 * 按个人曲库中的 beatmapset id 批量补齐 osu! 详情。
 * query key 与单曲详情完全一致，因此两处共享同一份 60 秒 React Query 缓存。
 */
export function useOsuBeatmapsetsByIds(
  gameId: OsuGameId,
  beatmapsetIds: readonly string[],
) {
  const session = useSession((state) => state.session);
  const activeProviderId = useSession((state) => state.activeProviderId);
  const activeAccountId = useSession((state) => state.activeAccountId);
  const userId = osuUserIdFromAccountId(activeAccountId);
  const bound = activeProviderId === 'osu' && session?.mode === 'osu-oauth' && userId !== null;
  const uniqueIds = useMemo(
    () => [...new Set(beatmapsetIds.map(String).filter(Boolean))],
    [beatmapsetIds],
  );

  const queries = useQueries({
    queries: uniqueIds.map((beatmapsetId) => ({
      queryKey: ['osu-beatmapset-detail', gameId, userId, beatmapsetId] as const,
      queryFn: async (): Promise<OsuBeatmapsetDetail> => {
        const provider = new OsuScoreProvider(
          session as OsuOAuthSession,
          (next) => applyOsuTokenRotation(activeAccountId, next),
        );
        const raw = await provider.getBeatmapset(beatmapsetId);
        return normalizeOsuBeatmapsetDetail(raw, gameId);
      },
      enabled: bound,
      staleTime: 60_000,
    })),
  });

  const data = useMemo(() => {
    const map = new Map<string, OsuBeatmapsetDetail>();
    queries.forEach((query, index) => {
      if (query.data) map.set(uniqueIds[index], query.data);
    });
    return map;
  }, [queries, uniqueIds]);

  return {
    data,
    bound,
    isLoading: queries.some((query) => query.isLoading),
    isError: queries.some((query) => query.isError),
  };
}
