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

const osuCache = new OsuCache();
const EMPTY_SCORES: readonly OsuBestScore[] = [];

export function osuKnownScoresQueryKey(
  activeAccountId: string | null,
  gameId: OsuGameId | null,
  userId: number | null,
) {
  return ['osu-known-scores', activeAccountId, gameId, userId] as const;
}

/**
 * osu! 已知成绩集合：首次用当前 Best Top 100 去重播种，之后只读取本地持久化集合。
 * 打开歌曲详情发现的新成绩会通过同一 query key 合并进来，不请求 recent。
 */
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
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!enabled || !tabActive || !bound || gameId === null || userId === null || seedScores.length === 0) return;
    let cancelled = false;
    void osuCache.mergeKnownScores(gameId, userId, seedScores).then((snapshot) => {
      if (!cancelled) queryClient.setQueryData(key, snapshot);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [bound, enabled, gameId, key, seedScores, tabActive, userId]);

  const scores = useMemo(
    () => Object.values(query.data?.items ?? {}),
    [query.data?.items],
  );
  return { ...query, data: scores, snapshot: query.data, bound };
}

/** 打开歌曲详情时查询该模式下每张难度的玩家最佳成绩，并合并进已知集合。 */
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
    queryFn: async (): Promise<OsuBestScore[]> => {
      const currentSong = song as OsuBeatmapsetDetail;
      const provider = new OsuScoreProvider(
        session as OsuOAuthSession,
        (next) => applyOsuTokenRotation(activeAccountId, next),
      );
      const settled = await Promise.allSettled(currentSong.beatmaps.map(
        async (beatmap): Promise<OsuBestScore | null> => {
          const raw = await provider.getUserBeatmapScore(userId as number, beatmap.id, gameId);
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
      ));
      const scores = settled.flatMap((result) => (
        result.status === 'fulfilled' && result.value ? [result.value] : []
      ));
      if (scores.length > 0) {
        const snapshot = await osuCache.mergeKnownScores(gameId, userId as number, scores);
        queryClient.setQueryData<OsuKnownScoresSnapshot>(
          osuKnownScoresQueryKey(activeAccountId, gameId, userId),
          snapshot,
        );
      }
      const rejected = settled.find((result) => result.status === 'rejected');
      if (rejected?.status === 'rejected') throw rejected.reason;
      return scores;
    },
    enabled: bound && song !== null && song.beatmaps.length > 0,
    staleTime: 60_000,
  });
}
