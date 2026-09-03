import type { ChunithmCatalogSnapshot } from '@/domain/chunithm';
import { loadRemoteBestImageAssetDataUri } from '@/features/best-image/load-remote-best-image-asset';

export const CHUNITHM_BEST_IMAGE_JACKET_ROOT = 'https://assets2.lxns.net/chunithm/jacket';

const jacketDataUriCache = new Map<string, Promise<string | null>>();

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

async function loadJacketDataUri(jacketId: string): Promise<string | null> {
  const url = chunithmBestImageJacketUrl(jacketId);
  const cached = jacketDataUriCache.get(url);
  if (cached) return cached;

  const pending = loadRemoteBestImageAssetDataUri(url);
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
  return loadRemoteBestImageAssetDataUri(url);
}
