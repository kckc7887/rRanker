import { useQuery } from '@tanstack/react-query';
import {
  chunithmSongDetailResourceKey,
  type ChunithmSongDetailSnapshot,
} from '@/domain/chunithm';
import { ChunithmCatalogProvider } from '@/providers/chunithm-catalog-provider';
import { ResourceService } from '@/services/resource-service';
import { useSession } from '@/state/session-store';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';

const CHUNITHM_SONG_DETAIL_SCHEMA_VERSION = 1;
const repository = new SqliteSnapshotRepository();
const provider = new ChunithmCatalogProvider();

export function useChunithmSongDetail(songId: string | undefined) {
  const activeGameId = useSession((state) => state.activeGameId);
  const normalizedSongId = songId?.trim();
  return useQuery({
    enabled: activeGameId === 'chunithm' && !!normalizedSongId,
    queryKey: ['chunithm-song-detail', CHUNITHM_SONG_DETAIL_SCHEMA_VERSION, normalizedSongId],
    queryFn: (): Promise<ChunithmSongDetailSnapshot> => (
      new ResourceService(repository).load(
        chunithmSongDetailResourceKey(normalizedSongId!),
        CHUNITHM_SONG_DETAIL_SCHEMA_VERSION,
        () => provider.getSongDetail(normalizedSongId!),
      )
    ),
  });
}
