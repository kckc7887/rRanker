import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import { Image } from 'react-native';

export type BestImageEmbeddedAssets = {
  fontUrl: string;
  ratingFrameUrl: string;
};

const dataUriCache = new Map<number, Promise<string>>();

async function readBundledAssetBase64(moduleId: number): Promise<string> {
  try {
    const [asset] = await Asset.loadAsync(moduleId);
    if (!asset) throw new Error('打包素材不存在');
    const uri = asset.localUri ?? asset.uri;
    if (!uri) throw new Error('打包素材没有可读取的 URI');
    return await new File(uri).base64();
  } catch (initialError) {
    /** Android release 的资源标识需先复制为可读缓存文件。 */

    const resourceUri = Image.resolveAssetSource(moduleId)?.uri;
    if (!resourceUri) throw initialError;
    const [cachedAsset] = await Asset.loadAsync(resourceUri);
    const cachedUri = cachedAsset?.localUri ?? cachedAsset?.uri;
    if (!cachedUri) throw initialError;
    return await new File(cachedUri).base64();
  }
}

async function loadDataUri(moduleId: number, mimeType: string): Promise<string> {
  const cached = dataUriCache.get(moduleId);
  if (cached) return cached;

  const pending = readBundledAssetBase64(moduleId).then((base64) => {
    return `data:${mimeType};base64,${base64}`;
  });
  dataUriCache.set(moduleId, pending);

  try {
    return await pending;
  } catch (error) {
    dataUriCache.delete(moduleId);
    throw error;
  }
}

export async function loadBestImageAssets(
  fontSource: number,
  ratingFrameSource: number,
): Promise<BestImageEmbeddedAssets> {
  const [fontUrl, ratingFrameUrl] = await Promise.all([
    loadDataUri(fontSource, 'font/ttf'),
    loadDataUri(ratingFrameSource, 'image/png'),
  ]);
  return { fontUrl, ratingFrameUrl };
}
