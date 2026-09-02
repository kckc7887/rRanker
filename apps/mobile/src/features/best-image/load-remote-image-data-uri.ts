import { File, Paths } from 'expo-file-system';
import {
  loadCompressedRemoteImage,
  type RemoteImageCacheOptions,
} from '@/services/remote-image-cache';

let temporaryImageSequence = 0;
const inFlight = new Map<string, Promise<string | null>>();

function imageMimeType(url: string): string {
  const extension = /\.([a-z0-9]+)(?:[?#]|$)/iu.exec(url)?.[1]?.toLowerCase();
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'gif') return 'image/gif';
  if (extension === 'svg') return 'image/svg+xml';
  return 'image/png';
}

async function loadTemporaryImageAsDataUri(url: string): Promise<string | null> {
  temporaryImageSequence += 1;
  const file = new File(Paths.cache, `rranker-best-image-session-${Date.now()}-${temporaryImageSequence}.tmp`);
  try {
    await File.downloadFileAsync(url, file, { idempotent: true });
    if (!file.exists || (file.size ?? 0) <= 0) return null;
    return `data:${imageMimeType(url)};base64,${await file.base64()}`;
  } catch {
    return null;
  } finally {
    if (file.exists) file.delete();
  }
}

/** 歌曲封面复用公共压缩文件；其它远程素材只经任务临时文件读取。 */
export function loadRemoteImageAsDataUri(
  url: string | null | undefined,
  cacheOptions?: RemoteImageCacheOptions,
): Promise<string | null> {
  if (!url) return Promise.resolve(null);
  const requestKey = cacheOptions
    ? `${cacheOptions.gameId}|${cacheOptions.profile}|${url}`
    : url;
  const existing = inFlight.get(requestKey);
  if (existing) return existing;
  const pending = (async () => {
    if (cacheOptions) {
      try {
        const cached = await loadCompressedRemoteImage(url, cacheOptions);
        if (cached) {
          const file = new File(cached.fileUri);
          if (file.exists && (file.size ?? 0) > 0) {
            return `data:image/webp;base64,${await file.base64()}`;
          }
        }
      } catch {
        return null;
      }
      return null;
    }
    return loadTemporaryImageAsDataUri(url);
  })().finally(() => inFlight.delete(requestKey));
  inFlight.set(requestKey, pending);
  return pending;
}
