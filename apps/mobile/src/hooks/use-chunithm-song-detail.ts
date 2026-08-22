import { useQuery } from '@tanstack/react-query';
import {
  type ChunithmSongDetailSnapshot,
} from '@/domain/chunithm';
import { ChunithmCatalogProvider } from '@/providers/chunithm-catalog-provider';
import { useSession } from '@/state/session-store';

const CHUNITHM_SONG_DETAIL_SCHEMA_VERSION = 1;
const provider = new ChunithmCatalogProvider();

export function useChunithmSongDetail(songId: string | undefined) {
  const activeGameId = useSession((state) => state.activeGameId);
  const normalizedSongId = songId?.trim();
  const queryKey = ['chunithm-song-detail', CHUNITHM_SONG_DETAIL_SCHEMA_VERSION, normalizedSongId];
  return useQuery({
    enabled: activeGameId === 'chunithm' && !!normalizedSongId,
    queryKey,
    queryFn: (): Promise<ChunithmSongDetailSnapshot> => provider.getSongDetail(normalizedSongId!),
  });
}
