import type { QueryClient } from '@tanstack/react-query';
import { CHUNITHM_CATALOG_QUERY_KEY } from '@/services/chunithm-catalog-loader';
import { queryClient } from '@/state/query-client';

const MAIMAI_CATALOG_QUERY_KEY = ['detailed-catalog', 'maimai', 2] as const;

/** 无限新鲜缓存的失效入口。调用后下一次读取会重新请求，而不是继续用旧结果。 */
export async function invalidateMaimaiCatalog(client: QueryClient = queryClient): Promise<void> {
  await client.invalidateQueries({ queryKey: MAIMAI_CATALOG_QUERY_KEY, refetchType: 'none' });
}

export async function invalidateChunithmCatalog(client: QueryClient = queryClient): Promise<void> {
  await client.invalidateQueries({ queryKey: CHUNITHM_CATALOG_QUERY_KEY, refetchType: 'none' });
}

export async function invalidateMajdataCatalog(client: QueryClient = queryClient): Promise<void> {
  await client.invalidateQueries({ queryKey: ['majdata-net', 'catalog'], refetchType: 'active' });
}

export async function invalidateTufDifficulties(client: QueryClient = queryClient): Promise<void> {
  await client.invalidateQueries({ queryKey: ['tuf', 'difficulties'], refetchType: 'active' });
}

export async function invalidateMuseDashSessionResources(client: QueryClient = queryClient): Promise<void> {
  await Promise.all([
    client.invalidateQueries({ queryKey: ['musedash', 'albums'], refetchType: 'active' }),
    client.invalidateQueries({ queryKey: ['musedash', 'diffdiff'], refetchType: 'active' }),
    client.invalidateQueries({ queryKey: ['musedash', 'ce'], refetchType: 'active' }),
  ]);
}
