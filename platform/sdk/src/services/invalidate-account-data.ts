import type { QueryClient } from '@tanstack/react-query';
import type { BoundAccount } from '@rranker/sdk/account';
import { queryClient } from '@rranker/sdk/state/query-client';
import { invalidateResourceWrites } from '@rranker/sdk/services/snapshot-cache-utils';

export async function cancelBoundAccountQueries(account: BoundAccount, client: QueryClient): Promise<void> {
  invalidateResourceWrites('account:' + account.id);
  const owned = { predicate: (query: { meta?: Record<string, unknown>; queryKey: readonly unknown[] }) =>
    query.meta?.accountId === account.id || query.queryKey.includes(account.id) };
  await client.cancelQueries(owned);
  client.removeQueries(owned);
}

export function invalidateAccountDataQueries(
  client: QueryClient = queryClient,
  refetchType: 'active' | 'inactive' | 'all' | 'none' = 'active',
  includeGlobalResources = false,
): Promise<void> {
  return client.invalidateQueries({ predicate: query => typeof query.meta?.accountId === 'string'
    || (includeGlobalResources && typeof query.meta?.gameId === 'string'), refetchType });
}
