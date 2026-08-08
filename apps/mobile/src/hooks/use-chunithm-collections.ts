import { useQuery } from '@tanstack/react-query';
import {
  CHUNITHM_COLLECTION_LIST_SCHEMA_VERSION,
  type ChunithmCollectionKind,
  type ChunithmCollectionListSnapshot,
} from '@/domain/chunithm-collections';
import {
  loadChunithmCollections,
} from '@/services/chunithm-collection-loader';
import { useSession } from '@/state/session-store';

export function useChunithmCollections(kind: ChunithmCollectionKind) {
  const activeGameId = useSession((state) => state.activeGameId);
  const activeAccountId = useSession((state) => state.activeAccountId);
  return useQuery({
    enabled: activeGameId === 'chunithm',
    queryKey: ['chunithm-collections', CHUNITHM_COLLECTION_LIST_SCHEMA_VERSION, kind, activeAccountId],
    queryFn: () => loadChunithmCollections(kind),
    staleTime: 30 * 60_000,
  });
}

export function useChunithmCollectionProgress(kind: ChunithmCollectionKind, id: number | null) {
  const activeGameId = useSession((state) => state.activeGameId);
  const session = useSession((state) => state.session);
  const activeAccountId = useSession((state) => state.activeAccountId);
  return useQuery({
    enabled: activeGameId === 'chunithm'
      && session?.mode === 'lxns-oauth'
      && id !== null
      && Number.isSafeInteger(id),
    queryKey: ['chunithm-collection-progress', kind, id, activeAccountId],
    queryFn: async () => {
      if (session?.mode !== 'lxns-oauth' || id === null) {
        throw new Error('需要绑定落雪账号');
      }
      const { ChunithmScoreProvider } = await import('@/providers/chunithm-score-provider');
      const provider = new ChunithmScoreProvider(session);
      return provider.getCollectionProgress(kind, id);
    },
  });
}

export type { ChunithmCollectionListSnapshot };
