import { describe, expect, it } from 'vitest';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { releaseInactiveQueries } from '@/state/query-client';

describe('query cache cleanup', () => {
  it('retains observed data and removes unused data', () => {
    const client = new QueryClient();
    client.setQueryData(['active'], 'retained');
    client.setQueryData(['inactive'], 'discarded');
    const observer = new QueryObserver(client, { queryKey: ['active'], staleTime: Infinity });
    const unsubscribe = observer.subscribe(() => {});
    try {
      releaseInactiveQueries(client);
      expect(client.getQueryData(['active'])).toBe('retained');
      expect(client.getQueryData(['inactive'])).toBeUndefined();
    } finally { unsubscribe(); observer.destroy(); client.clear(); }
  });
});
