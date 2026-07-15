import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';

export type BestImageEmbeddedAssets = {
  fontUrl: string;
  ratingFrameUrl: string;
};

const dataUriCache = new Map<number, Promise<string>>();

async function loadDataUri(moduleId: number, mimeType: string): Promise<string> {
  const cached = dataUriCache.get(moduleId);
  if (cached) return cached;

  const pending = Asset.loadAsync(moduleId).then(async ([asset]) => {
    if (!asset) throw new Error('打包素材不存在');
    const uri = asset.localUri ?? asset.uri;
    if (!uri) throw new Error('打包素材没有可读取的 URI');
    const base64 = await new File(uri).base64();
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
