import { File } from 'expo-file-system';
import { Image } from 'expo-image';
import { imageCachePathToFileUri } from '@/features/best-image/load-best-image-jackets';

const cache = new Map<string, Promise<string | null>>();

export async function loadRemoteImageDataUri(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  const existing = cache.get(url);
  if (existing) return existing;
  const pending = (async () => {
    let path = await Image.getCachePathAsync(url);
    if (!path && await Image.prefetch(url, 'disk')) path = await Image.getCachePathAsync(url);
    if (!path) return null;
    return `data:image/png;base64,${await new File(imageCachePathToFileUri(path)).base64()}`;
  })();
  cache.set(url, pending);
  try { return await pending; } catch { cache.delete(url); return null; }
}

export async function loadPhigrosIllustrations(
  songIds: readonly string[],
  urlFor: (songId: string) => string | null,
  onProgress?: (done: number, total: number) => void,
): Promise<Record<string, string | null>> {
  const unique = [...new Set(songIds)];
  const result: Record<string, string | null> = {};
  onProgress?.(0, unique.length);
  for (const [index, id] of unique.entries()) {
    result[id] = await loadRemoteImageDataUri(urlFor(id));
    onProgress?.(index + 1, unique.length);
  }
  return result;
}
