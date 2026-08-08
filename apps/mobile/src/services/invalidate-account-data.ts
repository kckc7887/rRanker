import type { QueryClient } from '@tanstack/react-query';
import type { GameDataBundle } from '@/domain/game-data';
import { queryClient } from '@/state/query-client';

/**
 * 账号维度查询：key 内含 activeAccountId，切换账号后旧账号缓存不再被消费。
 * 清缓存只针对这些 key，避免切号时白清全局资源。
 */
const ACCOUNT_SCOPED_QUERY_KEYS = [
  ['game-data'],
  ['score-snapshot'],
  ['detailed-catalog'],
  ['plates'],
  ['collections'],
  ['songs'],
] as const;

/** 全局资源查询：与账号无关（如中二曲库），切号不应清除，否则切回需重新网络拉取。 */
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
 * 同步清空账号维度查询缓存。切换账号时在更新 activeAccountId 前调用，
 * 避免下一帧仍渲染旧 RQ 缓存并叠加重拉导致卡顿。
 * 不清理全局资源（chunithm-catalog 等账号无关曲库），切号不白拉。
 */
export function clearAccountDataQueries(client: QueryClient = queryClient): void {
  for (const queryKey of ACCOUNT_SCOPED_QUERY_KEYS) {
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

/** 全量数据查询 key（账号维度 + 全局资源），供存储管理清缓存等全量失效使用。 */
export function accountDataQueryKeys(): readonly (readonly string[])[] {
  return ALL_QUERY_KEYS;
}

/** 仅账号维度查询 key，供切号路径清缓存使用。 */
export function accountScopedDataQueryKeys(): readonly (readonly string[])[] {
  return ACCOUNT_SCOPED_QUERY_KEYS;
}
