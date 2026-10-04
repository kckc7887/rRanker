import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { invalidateMajdataCatalog, invalidateTufDifficulties } from '@/services/infinite-query-refresh';

describe('infinite query refresh', () => {
  it.each([
    [invalidateMajdataCatalog, ['majdata-net', 'catalog']],
    [invalidateTufDifficulties, ['tuf', 'difficulties']],
  ] as const)('reloads public data after explicit refresh', async (invalidate, queryKey) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    try {
      await client.fetchQuery({ queryKey, queryFn: async () => 'old' });
      await expect(client.fetchQuery({ queryKey, queryFn: async () => 'fresh' })).resolves.toBe('old');
      await invalidate(client);
      await expect(client.fetchQuery({ queryKey, queryFn: async () => 'fresh' })).resolves.toBe('fresh');
    } finally { client.clear(); }
  });
});
