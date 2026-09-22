import { describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import {
  invalidateChunithmCatalog,
  invalidateMaimaiCatalog,
  invalidateMajdataCatalog,
  invalidateMuseDashSessionResources,
  invalidateTufDifficulties,
} from '@/services/infinite-query-refresh';

describe('infinite query refresh', () => {
  it('reloads an infinite catalog after its refresh invalidation', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    let calls = 0;
    const key = ['detailed-catalog', 'maimai', 2] as const;
    await client.fetchQuery({ queryKey: key, queryFn: async () => { calls += 1; return 'old'; } });
    await client.fetchQuery({ queryKey: key, queryFn: async () => { calls += 1; return 'cached'; } });
    expect(calls).toBe(1);
    await invalidateMaimaiCatalog(client);
    await expect(client.fetchQuery({ queryKey: key, queryFn: async () => { calls += 1; return 'fresh'; } })).resolves.toBe('fresh');
    expect(calls).toBe(2);
  });

  it('invalidates chunithm, majdata, tuf, and muse dash session caches', async () => {
    const client = new QueryClient();
    const spy = vi.spyOn(client, 'invalidateQueries').mockResolvedValue();
    await invalidateChunithmCatalog(client);
    await invalidateMajdataCatalog(client);
    await invalidateTufDifficulties(client);
    await invalidateMuseDashSessionResources(client);
    expect(spy).toHaveBeenCalledWith({ queryKey: ['chunithm-catalog', 2], refetchType: 'none' });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['majdata-net', 'catalog'], refetchType: 'active' });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['tuf', 'difficulties'], refetchType: 'active' });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['musedash', 'albums'], refetchType: 'active' });
  });
});
