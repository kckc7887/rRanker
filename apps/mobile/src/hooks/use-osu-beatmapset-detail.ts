import { useQuery } from '@tanstack/react-query';
import { useCachedTabActive } from '@/components/CachedTabScreen';
import { osuUserIdFromAccountId } from '@/domain/bound-account';
import type { OsuGameId } from '@/domain/game-mode-family';
import { normalizeOsuBeatmapsetDetail, type OsuBeatmapsetDetail } from '@/domain/osu';
import { OsuScoreProvider } from '@/providers/osu-score-provider';
import type { OsuOAuthSession } from '@/providers/osu-oauth';
import { applyOsuTokenRotation, useSession } from '@/state/session-store';

export function useOsuBeatmapsetDetail(gameId: OsuGameId | null, beatmapsetId: string | null) {
  const active = useCachedTabActive();
  const session = useSession((s) => s.session);
  const activeProviderId = useSession((s) => s.activeProviderId);
  const activeAccountId = useSession((s) => s.activeAccountId);
  const userId = gameId === null ? null : osuUserIdFromAccountId(activeAccountId);
  const bound = activeProviderId === 'osu' && session?.mode === 'osu-oauth' && userId !== null;

  const query = useQuery({
    queryKey: ['osu-beatmapset-detail', gameId, userId, beatmapsetId] as const,
    queryFn: async ({ signal }): Promise<OsuBeatmapsetDetail> => {
      const provider = new OsuScoreProvider(
        session as OsuOAuthSession,
        (next, expected) => applyOsuTokenRotation(activeAccountId, next, expected),
      );
      const raw = await provider.getBeatmapset(beatmapsetId as string, signal);
      return normalizeOsuBeatmapsetDetail(raw, gameId as OsuGameId);
    },
    enabled: active && bound && beatmapsetId !== null,
    notifyOnChangeProps: active ? undefined : [],
    staleTime: 60_000,
  });

  return { ...query, bound };
}
