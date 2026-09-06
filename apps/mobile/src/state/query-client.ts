import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { recordRuntimeError } from '@/services/runtime-diagnostics-recorder';

export function releaseInactiveQueries(client: QueryClient): void {
  client.removeQueries({ predicate: (query) => !query.isActive() });
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: (error) => recordRuntimeError('query', error) }),
  mutationCache: new MutationCache({ onError: (error) => recordRuntimeError('mutation', error) }),
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
