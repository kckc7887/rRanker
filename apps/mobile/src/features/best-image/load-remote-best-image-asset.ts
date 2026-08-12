import { File } from 'expo-file-system';
import { Image } from 'expo-image';
import { imageCachePathToFileUri } from './load-best-image-jackets';

const remoteImageDataUriCache = new Map<string, Promise<string | null>>();

/** 复用既有 expo-image 磁盘缓存，把远程成绩图素材固定成本地 data URI。 */
export async function loadRemoteBestImageAssetDataUri(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
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

export async function loadFirstRemoteBestImageAssetDataUri(
  candidates: readonly (string | null | undefined)[],
): Promise<string | null> {
  for (const candidate of candidates) {
    const localized = await loadRemoteBestImageAssetDataUri(candidate);
    if (localized) return localized;
  }
  return null;
}
