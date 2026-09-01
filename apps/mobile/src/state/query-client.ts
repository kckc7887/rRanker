import { QueryClient } from '@tanstack/react-query';

export function releaseInactiveQueries(client: QueryClient): void {
  client.removeQueries({ predicate: (query) => !query.isActive() });
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
