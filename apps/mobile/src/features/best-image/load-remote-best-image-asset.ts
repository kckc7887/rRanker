import { loadRemoteImageAsDataUri } from './load-remote-image-data-uri';

export async function loadRemoteBestImageAssetDataUri(
  url: string | null | undefined,
  signal?: AbortSignal,
): Promise<string | null> {
  return loadRemoteImageAsDataUri(url, signal);
}
