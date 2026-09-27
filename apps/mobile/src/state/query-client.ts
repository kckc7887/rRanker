import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { registerGameDataBackground } from '@/services/game-data-query';
import { recordRuntimeError } from '@/services/runtime-diagnostics-recorder';

export function releaseInactiveQueries(client: QueryClient): void {
  client.removeQueries({ predicate: (query) => !query.isActive() });
}

export function resumeInterruptedActiveQueries(client: QueryClient): Promise<void> {
  return client.refetchQueries({
    type: 'active',
    predicate: query => query.state.status === 'pending'
      && query.state.fetchStatus === 'idle'
      && query.state.data === undefined,
  }, { cancelRefetch: false });
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: (error) => recordRuntimeError('query', error, false, { phase: 'final' }) }),
  mutationCache: new MutationCache({ onError: (error) => recordRuntimeError('mutation', error, false, { phase: 'final' }) }),
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// 终态句柄与实际查询同寿命；解绑、释放闲置查询与clear都回收其后台结果。
queryClient.getQueryCache().subscribe(event => {
  if (event.type === 'removed') registerGameDataBackground(event.query.queryKey, undefined);
});
