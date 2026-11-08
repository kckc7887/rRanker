export function indexSongsById<T extends { id: string }>(songs: readonly T[]): ReadonlyMap<string, T> {
  const index = new Map<string, T>();
  for (const song of songs) if (!index.has(song.id)) index.set(song.id, song);
  return index;
}
