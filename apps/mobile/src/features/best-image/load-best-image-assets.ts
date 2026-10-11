import { captureResourceWrites } from '@/services/snapshot-cache-utils';
import { Asset } from 'expo-asset';
import { Image } from 'react-native';
import { copyBestImageAsset, type BestImageAssetSession } from './load-best-image-session';

export type BestImageEmbeddedAssets = {
  fontUrl: string;
  ratingFrameUrl: string;
};

export async function loadBundledBestImageAssetUri(moduleId: number): Promise<string> {
  let initialError: unknown;
  try {
    const [asset] = await Asset.loadAsync(moduleId);
    const uri = asset?.localUri ?? asset?.uri;
    if (uri?.startsWith('file://')) return uri;
  } catch (error) {
    initialError = error;
  }
  /** Android release 的资源标识需先复制为可读缓存文件。 */
  const resourceUri = Image.resolveAssetSource(moduleId)?.uri;
  if (resourceUri) {
    const [asset] = await Asset.loadAsync(resourceUri);
    const uri = asset?.localUri ?? asset?.uri;
    if (uri?.startsWith('file://')) return uri;
  }
  if (initialError instanceof Error) throw initialError;
  throw new Error('打包素材没有可读取的本地文件');
}

export function loadBundledBestImageFile(
  session: BestImageAssetSession, moduleId: number, extension: string, signal?: AbortSignal,
): Promise<string> {
  const assertCurrent = captureResourceWrites(session.game);
  return session.requests.share(`bundled:${moduleId}`, async (requestSignal) => {
    const uri = await loadBundledBestImageAssetUri(moduleId);
    assertCurrent();
    return copyBestImageAsset(session, uri, `bundled-${moduleId}.${extension}`, requestSignal);
  }, signal);
}

export async function loadBestImageAssets(
  session: BestImageAssetSession, fontSource: number, ratingFrameSource: number, signal?: AbortSignal,
): Promise<BestImageEmbeddedAssets> {
  const [fontUrl, ratingFrameUrl] = await Promise.all([
    loadBundledBestImageFile(session, fontSource, 'ttf', signal),
    loadBundledBestImageFile(session, ratingFrameSource, 'png', signal),
  ]);
  return { fontUrl, ratingFrameUrl };
}
