import { File } from 'expo-file-system';
import { Image } from 'expo-image';
import type { ChunithmCatalogSnapshot } from '@/domain/chunithm';
import { imageCachePathToFileUri } from '@/features/best-image/load-best-image-jackets';

export const CHUNITHM_BEST_IMAGE_JACKET_ROOT = 'https://assets2.lxns.net/chunithm/jacket';

const jacketDataUriCache = new Map<string, Promise<string | null>>();
const remoteImageDataUriCache = new Map<string, Promise<string | null>>();

/** WORLD'S END 优先 originId，其余用 songId。 */
export function resolveChunithmBestImageJacketId(
  songId: string,
  levelIndex: number,
  catalog: ChunithmCatalogSnapshot | undefined,
): string {
  if (levelIndex === 5 && catalog) {
    const song = catalog.songs.find((entry) => String(entry.id) === songId);
    const originId = song?.difficulties.find((difficulty) => difficulty.difficulty === 5)?.originId;
    if (originId !== undefined && Number.isSafeInteger(originId) && originId >= 0) {
      return String(originId);
    }
  }
  return songId;
}

export function chunithmBestImageJacketUrl(jacketId: string): string {
  return `${CHUNITHM_BEST_IMAGE_JACKET_ROOT}/${encodeURIComponent(jacketId)}.png`;
}

async function loadUrlDataUri(url: string): Promise<string | null> {
  const cached = remoteImageDataUriCache.get(url);
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
  remoteImageDataUriCache.set(url, pending);

  try {
    const result = await pending;
    if (!result) remoteImageDataUriCache.delete(url);
    return result;
  } catch {
    remoteImageDataUriCache.delete(url);
    return null;
  }
}

async function loadJacketDataUri(jacketId: string): Promise<string | null> {
  const url = chunithmBestImageJacketUrl(jacketId);
  const cached = jacketDataUriCache.get(url);
  if (cached) return cached;

  const pending = loadUrlDataUri(url);
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

export async function loadChunithmBestImageJackets(
  jacketIds: readonly string[],
  onProgress?: (completed: number, total: number) => void,
): Promise<Record<string, string | null>> {
  const uniqueIds = [...new Set(jacketIds)];
  const output: Record<string, string | null> = {};
  onProgress?.(0, uniqueIds.length);
  for (const [index, jacketId] of uniqueIds.entries()) {
    output[jacketId] = await loadJacketDataUri(jacketId);
    onProgress?.(index + 1, uniqueIds.length);
  }
  return output;
}

export async function loadChunithmRemoteImageDataUri(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  return loadUrlDataUri(url);
}
