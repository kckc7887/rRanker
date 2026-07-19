import type { QueryClient } from '@tanstack/react-query';
import type { GameDataBundle } from '@/domain/game-data';
import { queryClient } from '@/state/query-client';

const ACCOUNT_DATA_QUERY_KEYS = [
  ['game-data'],
  ['score-snapshot'],
  ['detailed-catalog'],
  ['plates'],
  ['collections'],
  ['songs'],
] as const;

/** 切换游戏/查分器账号后，强制让成绩与曲库相关查询重新走对应 provider。 */
export async function invalidateAccountDataQueries(
  client: QueryClient = queryClient,
  refetchType: 'active' | 'inactive' | 'all' | 'none' = 'active',
): Promise<void> {
  await Promise.all(
    ACCOUNT_DATA_QUERY_KEYS.map((queryKey) => client.invalidateQueries({
      queryKey: [...queryKey],
      refetchType,
    })),
  );
}

/**
 * 本地玩家改名只需同步展示名，不应触发曲库/牌子等全量 refetch（会卡死命名弹层）。
 * queryKey: ['game-data', version, accountId, ...]
 */
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
      if (!current || current.payload.kind !== 'maimai') return current;
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

export function accountDataQueryKeys(): readonly (readonly string[])[] {
  return ACCOUNT_DATA_QUERY_KEYS;
}
