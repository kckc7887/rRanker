import { useQuery } from '@tanstack/react-query';
import {
  chunithmSongDetailResourceKey,
  type ChunithmSongDetailSnapshot,
} from '@/domain/chunithm';
import { ChunithmCatalogProvider } from '@/providers/chunithm-catalog-provider';
import { cacheFirstLoad } from '@/services/cache-first';
import { ResourceService } from '@/services/resource-service';
import { useSession } from '@/state/session-store';
import { queryClient } from '@/state/query-client';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';

const CHUNITHM_SONG_DETAIL_SCHEMA_VERSION = 1;
const repository = new SqliteSnapshotRepository();
const provider = new ChunithmCatalogProvider();

export function useChunithmSongDetail(songId: string | undefined) {
  const activeGameId = useSession((state) => state.activeGameId);
  const normalizedSongId = songId?.trim();
  const queryKey = ['chunithm-song-detail', CHUNITHM_SONG_DETAIL_SCHEMA_VERSION, normalizedSongId];
  return useQuery({
    enabled: activeGameId === 'chunithm' && !!normalizedSongId,
    queryKey,
    queryFn: (): Promise<ChunithmSongDetailSnapshot> => {
      const service = new ResourceService(repository);
      const resourceKey = chunithmSongDetailResourceKey(normalizedSongId!);
      return cacheFirstLoad({
        loadCached: () => service.getCached<ChunithmSongDetailSnapshot>(
          resourceKey,
          CHUNITHM_SONG_DETAIL_SCHEMA_VERSION,
        ),
        loadFresh: () => service.load(
          resourceKey,
          CHUNITHM_SONG_DETAIL_SCHEMA_VERSION,
          () => provider.getSongDetail(normalizedSongId!),
        ),
        onFresh: (fresh) => {
          queryClient.setQueryData(queryKey, fresh);
        },
      });
    },
  });
}
