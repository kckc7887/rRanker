import type { QueryClient } from '@tanstack/react-query';
import type { GameDataBundle } from '@/domain/game-data';
import { queryClient } from '@/state/query-client';

/**
 * 查询 key 包含账号 ID，防止账号之间共用缓存。
 * 清缓存只针对这些 key，避免切号时白清全局资源。
 */
const ACCOUNT_SCOPED_QUERY_KEYS = [
  ['game-data'],
  ['score-snapshot'],
  ['detailed-catalog'],
  ['plates'],
  ['collections'],
  ['songs'],
  ['osu-known-scores'],
  ['osu-beatmapset-user-scores'],
] as const;

/** 全局资源查询：与账号无关（如中二曲库）。 */
const GLOBAL_QUERY_KEYS = [
  ['chunithm-catalog'],
] as const;

const ALL_QUERY_KEYS = [
  ...ACCOUNT_SCOPED_QUERY_KEYS,
  ...GLOBAL_QUERY_KEYS,
] as const;

/** 切换游戏/查分器账号后，强制让成绩与曲库相关查询重新走对应 provider（含全局资源）。 */
export async function invalidateAccountDataQueries(
  client: QueryClient = queryClient,
  refetchType: 'active' | 'inactive' | 'all' | 'none' = 'active',
): Promise<void> {
  await Promise.all(
    ALL_QUERY_KEYS.map((queryKey) => client.invalidateQueries({
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

/** 全量数据查询 key（账号维度 + 全局资源），供存储管理清缓存等全量失效使用。 */
export function accountDataQueryKeys(): readonly (readonly string[])[] {
  return ALL_QUERY_KEYS;
}
