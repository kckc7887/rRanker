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

export function useChunithmCollections(kind: ChunithmCollectionKind, enabled = true) {
  const activeGameId = useSession((state) => state.activeGameId);
  const activeAccountId = useSession((state) => state.activeAccountId);
  const queryKey = ['chunithm-collections', CHUNITHM_COLLECTION_LIST_SCHEMA_VERSION, kind, activeAccountId];
  return useQuery({
    enabled: enabled && activeGameId === 'chunithm',
    queryKey,
    queryFn: (): Promise<ChunithmCollectionListSnapshot> => loadChunithmCollections(kind),
    staleTime: 30 * 60_000,
  });
}

export type { ChunithmCollectionListSnapshot };
