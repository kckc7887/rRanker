import { mapCoverId } from '@/domain/rating';
import { loadImageFiles, type BestImageAssetSession } from './load-best-image-session';

const JACKET_ROOT = 'https://assets2.lxns.net/maimai/jacket';

function bestImageJacketUrl(songId: string): string {
  const numericSongId = Number(songId);
  const coverId = Number.isSafeInteger(numericSongId) && numericSongId >= 0
    ? String(mapCoverId(numericSongId))
    : songId;
  return `${JACKET_ROOT}/${encodeURIComponent(coverId)}.png`;
}

export function loadBestImageJackets(session: BestImageAssetSession, songIds: readonly string[], onProgress?: (completed: number, total: number) => void, signal?: AbortSignal): Promise<Record<string, string | null>> {
  return loadImageFiles(session, songIds, bestImageJacketUrl, onProgress, signal);
}
