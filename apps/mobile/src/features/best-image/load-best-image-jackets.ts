import { File } from 'expo-file-system';
import { Image } from 'expo-image';
import { mapCoverId } from '@/domain/rating';

const JACKET_ROOT = 'https://assets2.lxns.net/maimai/jacket';
const jacketDataUriCache = new Map<string, Promise<string | null>>();

/** expo-image Android 返回绝对路径；expo-file-system File 只接受带 scheme 的 URI。 */
export function imageCachePathToFileUri(cachePath: string): string {
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(cachePath)) return cachePath;
  return `file://${cachePath.startsWith('/') ? '' : '/'}${cachePath}`;
}

export function bestImageJacketUrl(songId: string): string {
  const numericSongId = Number(songId);
  const coverId = Number.isSafeInteger(numericSongId) && numericSongId >= 0
    ? String(mapCoverId(numericSongId))
    : songId;
  return `${JACKET_ROOT}/${encodeURIComponent(coverId)}.png`;
}

async function loadJacketDataUri(songId: string): Promise<string | null> {
  const url = bestImageJacketUrl(songId);
  const cached = jacketDataUriCache.get(url);
  if (cached) return cached;

  const pending = (async () => {
    let localUri = await Image.getCachePathAsync(url);
    if (!localUri) {
      const prefetched = await Image.prefetch(url, 'disk');
      if (!prefetched) return null;
      localUri = await Image.getCachePathAsync(url);
    }
    if (!localUri) return null;
    return `data:image/png;base64,${await new File(imageCachePathToFileUri(localUri)).base64()}`;
  })();
  jacketDataUriCache.set(url, pending);

  try {
    const result = await pending;
    if (!result) jacketDataUriCache.delete(url);
    return result;
  } catch {
    jacketDataUriCache.delete(url);
    return null;
  }
}

export async function loadBestImageJackets(
  songIds: readonly string[],
  onProgress?: (completed: number, total: number) => void,
): Promise<Record<string, string | null>> {
  const uniqueSongIds = [...new Set(songIds)];
  const output: Record<string, string | null> = {};
  onProgress?.(0, uniqueSongIds.length);
  for (const [index, songId] of uniqueSongIds.entries()) {
    output[songId] = await loadJacketDataUri(songId);
    onProgress?.(index + 1, uniqueSongIds.length);
  }
  return output;
}
