import { useMemo } from 'react';
import { useBoundedQueries } from '@/hooks/use-bounded-queries';
import { osuUserIdFromAccountId } from '@/domain/bound-account';
import type { OsuGameId } from '@/domain/game-mode-family';
import { normalizeOsuBeatmapsetDetail, type OsuBeatmapsetDetail } from '@/domain/osu';
import { OsuScoreProvider } from '@/providers/osu-score-provider';
import { OsuPublicCatalogProvider } from '@/providers/osu-public-catalog-provider';
import type { OsuOAuthSession } from '@/providers/osu-oauth';
import { applyOsuTokenRotation, useSession } from '@/state/session-store';

export function useOsuBeatmapsetsByIds(
  gameId: OsuGameId,
  beatmapsetIds: readonly string[],
) {
  const session = useSession((state) => state.session);
  const activeProviderId = useSession((state) => state.activeProviderId);
  const activeAccountId = useSession((state) => state.activeAccountId);
  const userId = osuUserIdFromAccountId(activeAccountId);
  const demo = activeProviderId === 'osu-test';
  const bound = demo || (activeProviderId === 'osu' && session?.mode === 'osu-oauth' && userId !== null);
  const serializedIds = JSON.stringify([...new Set(beatmapsetIds.map(String).filter(Boolean))]);
  const uniqueIds = useMemo<string[]>(() => JSON.parse(serializedIds), [serializedIds]);

  const options = useMemo(() => uniqueIds.map((beatmapsetId) => ({
    queryKey: ['osu-beatmapset-detail', gameId, demo ? activeAccountId : userId, beatmapsetId] as const,
    queryFn: async ({ signal }: { signal: AbortSignal }): Promise<OsuBeatmapsetDetail> => {
      if (demo) return new OsuPublicCatalogProvider().getBeatmapset(beatmapsetId, gameId, signal);
      const provider = new OsuScoreProvider(
        session as OsuOAuthSession,
        (next, expected) => applyOsuTokenRotation(activeAccountId, next, expected),
      );
      const raw = await provider.getBeatmapset(beatmapsetId, signal);
      return normalizeOsuBeatmapsetDetail(raw, gameId);
    },
    staleTime: 60_000,
  })), [activeAccountId, demo, gameId, session, uniqueIds, userId]);
  const { queries } = useBoundedQueries(options, 4, bound);

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
