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
 * 同步清空账号相关查询缓存。切换账号时在更新 activeAccountId 前调用，
 * 避免下一帧仍渲染旧 RQ 缓存并叠加重拉导致卡顿。
 */
export function clearAccountDataQueries(client: QueryClient = queryClient): void {
  for (const queryKey of ACCOUNT_DATA_QUERY_KEYS) {
    client.removeQueries({ queryKey: [...queryKey] });
  }
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
