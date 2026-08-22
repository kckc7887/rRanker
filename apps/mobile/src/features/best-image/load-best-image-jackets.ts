import { mapCoverId } from '@/domain/rating';
import { loadRemoteImageAsDataUri } from './load-remote-image-data-uri';

const JACKET_ROOT = 'https://assets2.lxns.net/maimai/jacket';

/** 将 Android 原生绝对路径转为 expo-file-system 可读 URI。 */
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
  return loadRemoteImageAsDataUri(url);
}

export async function loadBestImageJackets(
  songIds: readonly string[],
  onProgress?: (completed: number, total: number) => void,
): Promise<Record<string, string | null>> {
  const uniqueSongIds = [...new Set(songIds)];
  const output: Record<string, string | null> = {};
  const loadedByUrl = new Map<string, string | null>();
  onProgress?.(0, uniqueSongIds.length);
  for (const [index, songId] of uniqueSongIds.entries()) {
    const url = bestImageJacketUrl(songId);
    const loaded = loadedByUrl.has(url) ? loadedByUrl.get(url)! : await loadJacketDataUri(songId);
    loadedByUrl.set(url, loaded);
    output[songId] = loaded;
    onProgress?.(index + 1, uniqueSongIds.length);
  }
  return output;
}
