import type { QueryClient } from '@tanstack/react-query';
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
): Promise<void> {
  await Promise.all(
    ACCOUNT_DATA_QUERY_KEYS.map((queryKey) => client.invalidateQueries({ queryKey: [...queryKey] })),
  );
}

export function accountDataQueryKeys(): readonly (readonly string[])[] {
  return ACCOUNT_DATA_QUERY_KEYS;
}
