import { useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { osuUserIdFromAccountId } from '@/domain/bound-account';
import type { OsuGameId } from '@/domain/game-mode-family';
import {
  normalizeOsuCatalogSongs,
  type OsuBeatmapsetSearchParams,
  type OsuCatalogSong,
  type OsuExtraFlag,
  type OsuGeneralFlag,
  type OsuSearchStatus,
} from '@/domain/osu';
import { OsuScoreProvider } from '@/providers/osu-score-provider';
import type { OsuOAuthSession } from '@/providers/osu-oauth';
import { applyOsuTokenRotation, useSession } from '@/state/session-store';
import { useCachedTabActive } from '@/components/CachedTabScreen';

export type OsuCatalogSearchInput = {
  q?: string;
  general: readonly OsuGeneralFlag[];
  status: OsuSearchStatus;
  genre: number;
  language: number;
  nsfw: boolean;
  extras: readonly OsuExtraFlag[];
};

export type OsuCatalogPage = {
  songs: OsuCatalogSong[];
  total: number;
  recommendedDifficulty: number | null;
  cursor: string | null;
};

export function useOsuCatalogSearch(gameId: OsuGameId | null, input: OsuCatalogSearchInput, enabled = true) {
  const tabActive = useCachedTabActive();
  const session = useSession((s) => s.session);
  const activeProviderId = useSession((s) => s.activeProviderId);
  const activeAccountId = useSession((s) => s.activeAccountId);
  const userId = gameId === null ? null : osuUserIdFromAccountId(activeAccountId);
  const bound = activeProviderId === 'osu' && session?.mode === 'osu-oauth' && userId !== null;

  const params = useMemo<OsuBeatmapsetSearchParams | null>(
    () => (gameId === null ? null : { gameId, ...input }),
    [gameId, input],
  );

  const query = useInfiniteQuery({
    queryKey: ['osu-catalog-search', gameId, userId, params] as const,
    queryFn: async ({ pageParam, signal }): Promise<OsuCatalogPage> => {
      const provider = new OsuScoreProvider(
        session as OsuOAuthSession,
        (next, expected) => applyOsuTokenRotation(activeAccountId, next, expected),
      );
      const raw = await provider.searchBeatmapsets({
        ...(params as OsuBeatmapsetSearchParams),
        cursor: pageParam,
      }, signal);
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
    notifyOnChangeProps: tabActive ? undefined : [],
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
