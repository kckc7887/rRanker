import { useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useCachedTabActive } from '@/components/CachedTabScreen';
import type { OsuGameId } from '@/domain/game-mode-family';
import { buildMaxedOsuBestScores } from '@/providers/maxed-osu-test-provider';
import { OsuPublicCatalogProvider } from '@/providers/osu-public-catalog-provider';
import { useSession } from '@/state/session-store';

const provider = new OsuPublicCatalogProvider();

export function useOsuDemoScores(gameId: OsuGameId | null, enabled = true) {
  const active = useCachedTabActive();
  const activeProviderId = useSession((state) => state.activeProviderId);
  const activeAccountId = useSession((state) => state.activeAccountId);
  const bound = activeProviderId === 'osu-test' && gameId !== null;
  const query = useInfiniteQuery({
    queryKey: ['osu-demo-scores', activeAccountId, gameId] as const,
    queryFn: ({ pageParam, signal }) => provider.searchBeatmapsets({
      gameId: gameId as OsuGameId,
      page: pageParam,
      rankedOnly: true,
    }, signal),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextPage,
    enabled: enabled && active && bound,
    notifyOnChangeProps: active ? undefined : [],
    staleTime: 60_000,
  });
  const scores = useMemo(() => {
    const seen = new Set<number>();
    const songs = (query.data?.pages ?? []).flatMap((page) => page.songs).filter((song) => {
      if (seen.has(song.beatmapSetId)) return false;
      seen.add(song.beatmapSetId);
      return true;
    });
    return buildMaxedOsuBestScores(songs);
  }, [query.data]);
  return { ...query, bound, scores };
}
