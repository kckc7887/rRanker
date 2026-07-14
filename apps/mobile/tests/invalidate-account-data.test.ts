import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import {
  accountDataQueryKeys,
  invalidateAccountDataQueries,
} from '@/services/invalidate-account-data';

describe('invalidateAccountDataQueries', () => {
  it('invalidates all account-scoped data queries', async () => {
    const client = new QueryClient();
    const spy = vi.spyOn(client, 'invalidateQueries').mockResolvedValue(undefined);

    await invalidateAccountDataQueries(client);

    expect(spy.mock.calls.map((call) => call[0]?.queryKey)).toEqual(
      accountDataQueryKeys().map((key) => [...key]),
    );
  });
});
