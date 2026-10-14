import type { QueryClient } from '@tanstack/react-query';
import type { GameDataBundle } from '@/domain/game-data';
import type { BoundAccount } from '@/domain/bound-account';
import { queryClient } from '@/state/query-client';
import { invalidateResourceWrites } from '@/services/snapshot-cache-utils';

export async function cancelBoundAccountQueries(account: BoundAccount, client: QueryClient): Promise<void> {
  invalidateResourceWrites('account:' + account.id);
  const externalId = account.id.slice(account.id.lastIndexOf(':') + 1);
  const owned = { predicate: ({ queryKey: key }: { queryKey: readonly unknown[] }) => {
    if (key.includes(account.id)) return true;
    if (account.gameId === 'adofai') return key[0] === 'tuf' && key[1] === 'player' && String(key[2]) === externalId;
    if (account.gameId === 'musedash') return key[0] === 'musedash'
      && (key[1] === 'player' || key[1] === 'play-detail') && key[2] === externalId;
    if (account.gameId === 'phira') return key[0] === 'phira'
      && ['player', 'bests', 'best'].includes(String(key[1])) && String(key[2]) === externalId;
    return false;
  } };
  await client.cancelQueries(owned);
  client.removeQueries(owned);
}

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
