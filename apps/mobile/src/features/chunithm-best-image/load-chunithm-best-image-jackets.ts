import { loadImageDataUris } from '@/features/best-image/load-remote-image-data-uri';
import type { ChunithmCatalogSnapshot } from '@/domain/chunithm';
import { loadRemoteBestImageAssetDataUri } from '@/features/best-image/load-remote-best-image-asset';

export const CHUNITHM_BEST_IMAGE_JACKET_ROOT = 'https://assets2.lxns.net/chunithm/jacket';


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

export function loadChunithmBestImageJackets(jacketIds: readonly string[], onProgress?: (completed: number, total: number) => void, signal?: AbortSignal): Promise<Record<string, string | null>> {
  return loadImageDataUris(jacketIds, chunithmBestImageJacketUrl, onProgress, signal);
}
export function loadChunithmRemoteImageDataUri(url: string | null | undefined, signal?: AbortSignal): Promise<string | null> {
  return loadRemoteBestImageAssetDataUri(url, signal);
}
