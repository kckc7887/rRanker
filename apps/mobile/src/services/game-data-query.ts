import type { GameDataBundle } from '@/domain/game-data';
import { queryClient } from '@/state/query-client';

/**
 * game-data 查询 key 的版本号：缓存结构或字段语义变化时递增，确保旧缓存不再被消费。
 * 与 useGameData 共享同一常量，避免 key 构造分叉。
 */
export const GAME_DATA_QUERY_VERSION = 18;

/** 与 useGameData 查询一致的账号维度 key。providerId 取 activeAccount.providerId，与 session.activeProviderId 恒等。 */
export function gameDataQueryKey(
  accountId: string,
  gameId: string,
  providerId: string | null,
  mode: string | null,
): readonly unknown[] {
  return ['game-data', GAME_DATA_QUERY_VERSION, accountId, gameId, providerId, mode ?? 'none'];
}

/**
 * 读取账号维度的最终缓存 bundle，供用户主动同步在等待后台网络读取落定后判定真实结果。
 * 测试环境等 queryClient 未提供 getQueryData 时返回 undefined，由调用方回退到 refetch 结果。
 */
export function readSettledGameDataBundle(
  accountId: string,
  gameId: string,
  providerId: string | null,
  mode: string | null,
): GameDataBundle | undefined {
  if (typeof queryClient.getQueryData !== 'function') return undefined;
  return queryClient.getQueryData<GameDataBundle>(
    gameDataQueryKey(accountId, gameId, providerId, mode),
  );
}
