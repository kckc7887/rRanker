import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { osuUserIdFromAccountId } from '@/domain/bound-account';
import type { OsuGameId } from '@/domain/game-mode-family';
import {
  normalizeOsuBeatmapUserScore,
  type OsuBeatmapsetDetail,
  type OsuBestScore,
  type OsuKnownScoresSnapshot,
} from '@/domain/osu';
import { OsuScoreProvider } from '@/providers/osu-score-provider';
import type { OsuOAuthSession } from '@/providers/osu-oauth';
import { OsuCache } from '@/services/osu-cache';
import { queryClient } from '@/state/query-client';
import { applyOsuTokenRotation, useSession } from '@/state/session-store';
import { useCachedTabActive } from '@/components/CachedTabScreen';
import { captureResourceWrites } from '@/services/snapshot-cache-utils';
import { loadItemsBounded } from '@/services/offset-pagination';

const osuCache = new OsuCache();
const EMPTY_SCORES: readonly OsuBestScore[] = [];

export function osuKnownScoresQueryKey(
  activeAccountId: string | null,
  gameId: OsuGameId | null,
  userId: number | null,
) {
  return ['osu-known-scores', activeAccountId, gameId, userId] as const;
}

export function useOsuKnownScores(
  gameId: OsuGameId | null,
  seedScores: readonly OsuBestScore[] = EMPTY_SCORES,
  enabled = true,
) {
  const tabActive = useCachedTabActive();
  const session = useSession((state) => state.session);
  const activeProviderId = useSession((state) => state.activeProviderId);
  const activeAccountId = useSession((state) => state.activeAccountId);
  const userId = gameId === null ? null : osuUserIdFromAccountId(activeAccountId);
  const bound = activeProviderId === 'osu' && session?.mode === 'osu-oauth' && userId !== null;
  const key = useMemo(
    () => osuKnownScoresQueryKey(activeAccountId, gameId, userId),
    [activeAccountId, gameId, userId],
  );

  const query = useQuery({
    queryKey: key,
    queryFn: () => osuCache.loadKnownScores(gameId as OsuGameId, userId as number),
    enabled: enabled && tabActive && bound,
    notifyOnChangeProps: tabActive ? undefined : [],
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!enabled || !tabActive || !bound || gameId === null || userId === null || seedScores.length === 0) return;
    const controller = new AbortController();
    const assertCurrent = captureResourceWrites(gameId, controller.signal, activeAccountId ?? undefined);
    void osuCache.mergeKnownScores(gameId, userId, seedScores, assertCurrent).then((snapshot) => {
      assertCurrent();
      queryClient.setQueryData(key, snapshot);
    }).catch(() => undefined);
    return () => { controller.abort(); };
  }, [activeAccountId, bound, enabled, gameId, key, seedScores, tabActive, userId]);

  const scores = useMemo(
    () => Object.values(query.data?.items ?? {}),
    [query.data?.items],
  );
  return { ...query, data: scores, snapshot: query.data, bound };
}

export function useOsuBeatmapsetUserScores(
  gameId: OsuGameId,
  song: OsuBeatmapsetDetail | null,
) {
  const session = useSession((state) => state.session);
  const activeProviderId = useSession((state) => state.activeProviderId);
  const activeAccountId = useSession((state) => state.activeAccountId);
  const userId = osuUserIdFromAccountId(activeAccountId);
  const bound = activeProviderId === 'osu' && session?.mode === 'osu-oauth' && userId !== null;

  return useQuery({
    queryKey: [
      'osu-beatmapset-user-scores',
      activeAccountId,
      gameId,
      userId,
      song?.beatmapSetId ?? null,
    ] as const,
    queryFn: async ({ signal }): Promise<OsuBestScore[]> => {
      const assertCurrent = captureResourceWrites(gameId, signal, activeAccountId ?? undefined);
      const currentSong = song as OsuBeatmapsetDetail;
      const provider = new OsuScoreProvider(
        session as OsuOAuthSession,
        (next, expected) => applyOsuTokenRotation(activeAccountId, next, expected),
      );
      const scoresById = new Map<number, OsuBestScore>();
      const failures = await loadItemsBounded({
        items: currentSong.beatmaps, concurrency: 4, signal,
        onItem: (score: OsuBestScore | null, beatmap) => { if (score) scoresById.set(beatmap.id, score); },
        load: async (beatmap): Promise<OsuBestScore | null> => {
          const raw = await provider.getUserBeatmapScore(userId as number, beatmap.id, gameId, signal);
          if (!raw) return null;
          return normalizeOsuBeatmapUserScore(
            raw,
            gameId,
            {
              id: beatmap.id,
              beatmapSetId: currentSong.beatmapSetId,
              difficultyRating: beatmap.difficultyRating,
              version: beatmap.version,
            },
            {
              id: currentSong.beatmapSetId,
              title: currentSong.title,
              artist: currentSong.artist,
              creator: currentSong.creator,
              listCover: currentSong.cover,
            },
          );
        },
      });
      const scores = currentSong.beatmaps.flatMap(beatmap => {
        const score = scoresById.get(beatmap.id);
        return score ? [score] : [];
      });
      if (scores.length > 0 && !signal.aborted) {
        const snapshot = await osuCache.mergeKnownScores(gameId, userId as number, scores, assertCurrent);
        assertCurrent();
        queryClient.setQueryData<OsuKnownScoresSnapshot>(
          osuKnownScoresQueryKey(activeAccountId, gameId, userId),
          snapshot,
        );
      }
      if (signal.aborted) throw signal.reason ?? new Error('操作已取消');
      if (failures.length) throw failures[0].error;
      return scores;
    },
    enabled: bound && song !== null && song.beatmaps.length > 0,
    staleTime: 60_000,
  });
}
