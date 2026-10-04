import { mapCoverId } from '@/domain/rating';
import { loadImageDataUris } from './load-remote-image-data-uri';

const JACKET_ROOT = 'https://assets2.lxns.net/maimai/jacket';

function bestImageJacketUrl(songId: string): string {
  const numericSongId = Number(songId);
  const coverId = Number.isSafeInteger(numericSongId) && numericSongId >= 0
    ? String(mapCoverId(numericSongId))
    : songId;
  return `${JACKET_ROOT}/${encodeURIComponent(coverId)}.png`;
}

export function loadBestImageJackets(songIds: readonly string[], onProgress?: (completed: number, total: number) => void, signal?: AbortSignal): Promise<Record<string, string | null>> {
  return loadImageDataUris(songIds, bestImageJacketUrl, onProgress, signal);
}
