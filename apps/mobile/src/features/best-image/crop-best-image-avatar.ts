import { Image } from 'react-native';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';
import { File } from 'expo-file-system';
import { deleteAsync } from 'expo-file-system/legacy';
import { cropPixels, type ImageCrop } from '@/components/image-crop';
import { captureResourceWrites } from '@/services/snapshot-cache-utils';
import { copyBestImageAsset, type BestImageAssetSession } from './load-best-image-session';

export async function cropBestImageAvatar(session: BestImageAssetSession, uri: string, crop: ImageCrop | null, signal: AbortSignal): Promise<string> {
  if (!crop) return uri;
  const assertCurrent = captureResourceWrites(session.game, signal);
  const hash = await digestStringAsync(CryptoDigestAlgorithm.SHA256, JSON.stringify([uri, crop]));
  const name = `avatar-${hash}.png`; const target = new File(session.directory, name);
  assertCurrent();
  if (target.exists && target.size > 0) return target.uri;
  const size = await Image.getSize(uri); assertCurrent();
  const context = ImageManipulator.manipulate(uri);
  let rendered: Awaited<ReturnType<typeof context.renderAsync>> | null = null;
  let temporary: string | null = null;
  try {
    context.crop(cropPixels(size, crop));
    rendered = await context.renderAsync(); assertCurrent();
    const result = await rendered.saveAsync({ format: SaveFormat.PNG }); temporary = result.uri; assertCurrent();
    return await copyBestImageAsset(session, temporary, name, signal);
  } finally {
    rendered?.release(); context.release();
    if (temporary) await deleteAsync(temporary, { idempotent: true });
  }
}
