import type { Song } from '@/domain/models';

export function filterSongs(songs: Song[], keyword: string): Song[] {
  const kw = keyword.trim().toLowerCase();
  if (!kw) return songs;
  return songs.filter(
    (s) => s.title.toLowerCase().includes(kw) || s.id.toLowerCase().includes(kw),
  );
}
