import { useQuery } from '@tanstack/react-query';
import {
  CHUNITHM_COLLECTION_LIST_SCHEMA_VERSION,
  type ChunithmCollectionKind,
  type ChunithmCollectionListSnapshot,
} from '@/domain/chunithm-collections';
import {
  chunithmCollectionListResourceKey,
  loadChunithmCollections,
} from '@/services/chunithm-collection-loader';
import { cacheFirstLoad } from '@/services/cache-first';
import { ResourceService } from '@/services/resource-service';
import { useSession } from '@/state/session-store';
import { queryClient } from '@/state/query-client';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';

const repository = new SqliteSnapshotRepository();

export function useChunithmCollections(kind: ChunithmCollectionKind) {
  const activeGameId = useSession((state) => state.activeGameId);
  const activeAccountId = useSession((state) => state.activeAccountId);
  const queryKey = ['chunithm-collections', CHUNITHM_COLLECTION_LIST_SCHEMA_VERSION, kind, activeAccountId];
  return useQuery({
    enabled: activeGameId === 'chunithm',
    queryKey,
    queryFn: (): Promise<ChunithmCollectionListSnapshot> => {
      const service = new ResourceService(repository);
      const resourceKey = chunithmCollectionListResourceKey(kind);
      return cacheFirstLoad({
        loadCached: () => service.getCached<ChunithmCollectionListSnapshot>(
          resourceKey,
          CHUNITHM_COLLECTION_LIST_SCHEMA_VERSION,
        ),
        loadFresh: () => loadChunithmCollections(kind),
        onFresh: (fresh) => {
          queryClient.setQueryData(queryKey, fresh);
        },
      });
    },
    staleTime: 30 * 60_000,
  });
}

export type { ChunithmCollectionListSnapshot };
