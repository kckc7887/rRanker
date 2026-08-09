import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { TUF_PAGE_SIZE, type TufPassQuery } from '@/domain/tuf';
import { tufProvider } from '@/providers/tuf-provider';

const TUF_QUERY_OPTIONS = { staleTime: 60_000, gcTime: 10 * 60_000 } as const;

export function useTufPlayerSearch(query: string) {
  const normalized = query.trim();
  return useQuery({
    queryKey: ['tuf', 'players', 'search', normalized],
    queryFn: () => tufProvider.searchPlayers(normalized, TUF_PAGE_SIZE, 0),
    enabled: normalized.length > 0,
    ...TUF_QUERY_OPTIONS,
  });
}

export function useTufProfile(playerId: number | null) {
  return useQuery({
    queryKey: ['tuf', 'player', playerId, 'profile'],
    queryFn: () => tufProvider.getPlayerProfile(playerId!),
    enabled: playerId !== null,
    ...TUF_QUERY_OPTIONS,
  });
}

export function useTufPasses(playerId: number | null, options: Omit<TufPassQuery, 'offset' | 'limit'>) {
  return useInfiniteQuery({
    queryKey: ['tuf', 'player', playerId, 'passes', options],
    queryFn: ({ pageParam }) => tufProvider.getPasses(playerId!, {
      ...options, offset: pageParam, limit: TUF_PAGE_SIZE,
    }),
    initialPageParam: 0,
    getNextPageParam: (last) => last.offset + last.passes.length < last.total
      ? last.offset + last.limit
      : undefined,
    enabled: playerId !== null,
    ...TUF_QUERY_OPTIONS,
  });
}

export function useTufLevelSearch(query: string) {
  const normalized = query.trim();
  return useInfiniteQuery({
    queryKey: ['tuf', 'levels', normalized],
    queryFn: ({ pageParam }) => tufProvider.searchLevels({
      query: normalized || undefined, offset: pageParam, limit: TUF_PAGE_SIZE,
    }),
    initialPageParam: 0,
    getNextPageParam: (last) => last.hasMore ? last.offset + last.limit : undefined,
    ...TUF_QUERY_OPTIONS,
  });
}

export function useTufLevel(levelId: number | null) {
  return useQuery({
    queryKey: ['tuf', 'level', levelId],
    queryFn: () => tufProvider.getLevel(levelId!),
    enabled: levelId !== null,
    ...TUF_QUERY_OPTIONS,
  });
}
