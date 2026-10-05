import type { QueryClient } from '@tanstack/react-query';
import type { GameDataBundle } from '@/domain/game-data';
import { queryClient } from '@/state/query-client';

const ACCOUNT_SCOPED_QUERY_KEYS = [
  ['game-data'],
  ['score-snapshot'],
  ['plates'],
  ['collections'],
  ['songs'],
  ['osu-known-scores'],
  ['osu-beatmapset-user-scores'],
  ['phigros-push-rks'],
] as const;

const GLOBAL_QUERY_KEYS = [
  ['detailed-catalog'],
  ['chunithm-catalog'],
] as const;

const ALL_QUERY_KEYS = [
  ...ACCOUNT_SCOPED_QUERY_KEYS,
  ...GLOBAL_QUERY_KEYS,
] as const;

export async function invalidateAccountDataQueries(
  client: QueryClient = queryClient,
  refetchType: 'active' | 'inactive' | 'all' | 'none' = 'active',
  includeGlobalResources = false,
): Promise<void> {
  const queryKeys = includeGlobalResources ? ALL_QUERY_KEYS : ACCOUNT_SCOPED_QUERY_KEYS;
  await Promise.all(
    queryKeys.map((queryKey) => client.invalidateQueries({
      queryKey: [...queryKey],
      refetchType,
    })),
  );
}

export function patchMaimaiPlayerDisplayName(
  accountId: string,
  displayName: string,
  client: QueryClient = queryClient,
): void {
  client.setQueriesData<GameDataBundle>(
    {
      predicate: (query) => {
        const key = query.queryKey;
        return Array.isArray(key) && key[0] === 'game-data' && key[2] === accountId;
      },
    },
    (current) => {
      if (!current || current.gameId !== 'maimai' || current.payload.kind !== 'maimai') return current;
      return {
        ...current,
        payload: {
          ...current.payload,
          player: { ...current.payload.player, displayName },
          snapshot: {
            ...current.payload.snapshot,
            player: { ...current.payload.snapshot.player, displayName },
          },
        },
      };
    },
  );
}
