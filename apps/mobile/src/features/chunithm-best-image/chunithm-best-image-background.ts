import type { ChunithmSong } from '@/domain/chunithm';

export function filterChunithmBestImageBackgroundSongs(
  songs: readonly ChunithmSong[],
  query: string,
): readonly ChunithmSong[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return songs;
  return songs.filter((song) => (
    song.title.toLocaleLowerCase().includes(normalized)
    || song.artist?.toLocaleLowerCase().includes(normalized)
    || String(song.id).includes(normalized)
  ));
}
