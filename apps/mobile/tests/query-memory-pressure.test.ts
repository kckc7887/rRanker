import { describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { releaseInactiveQueries } from '@/state/query-client';

describe('query memory pressure', () => {
  it('removes only inactive queries', () => {
    const client = new QueryClient();
    const removeQueries = vi.spyOn(client, 'removeQueries');

    releaseInactiveQueries(client);

    const predicate = removeQueries.mock.calls[0]?.[0]?.predicate;
    expect(predicate?.({ isActive: () => true } as never)).toBe(false);
    expect(predicate?.({ isActive: () => false } as never)).toBe(true);
  });
});
