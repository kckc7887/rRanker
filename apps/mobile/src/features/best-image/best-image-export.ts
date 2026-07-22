import * as MediaLibrary from 'expo-media-library';
import { File, Paths } from 'expo-file-system';

export class BestImageExportError extends Error {}

export function bestImageCaptureDimensions(
  outputWidth: number,
  outputHeight: number,
  pixelRatio: number,
  platform: string,
): { width: number; height: number } {
  const safeRatio = Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1;
  if (platform === 'ios') {
    return { width: outputWidth / safeRatio, height: outputHeight / safeRatio };
  }
  return { width: outputWidth, height: outputHeight };
}

export function shouldUseBestImageRenderInContext(
  platform: string,
  outputWidth: number,
  outputHeight: number,
): boolean {
  return platform === 'ios' && (outputWidth >= 1440 || outputHeight >= outputWidth * 4);
}

export function isDrawViewHierarchyError(error: unknown): boolean {
  return error instanceof Error && /drawViewHierarchyInRect|view cannot be captured/iu.test(error.message);
}

function safeFilePart(value: string): string {
  const normalized = value.normalize('NFKC').trim().replace(/[<>:"/\\|?*\u0000-\u001F]/gu, '_');
  return normalized.slice(0, 40) || 'player';
}

export function bestImageExportFilename(
  playerName: string,
  imageType: 'best50' | 'best30' | 'custom',
  pageIndex: number,
  pageCount: number,
  now = new Date(),
): string {
  const stamp = now.toISOString().replace(/[-:]/gu, '').replace(/\.\d{3}Z$/u, 'Z');
  const page = pageCount > 1 ? `-${pageIndex + 1}of${pageCount}` : '';
  return `rRanker-${safeFilePart(playerName)}-${imageType}-${stamp}${page}.png`;
}

export async function requestBestImageExportPermission(): Promise<void> {
  if (!await MediaLibrary.isAvailableAsync()) throw new BestImageExportError('当前设备不支持保存到相册');
  const permission = await MediaLibrary.requestPermissionsAsync(true, ['photo']);
  if (!permission.granted) throw new BestImageExportError('没有相册写入权限，无法导出图片');
}

export async function saveBestImageCapture(captureUri: string, filename: string): Promise<void> {
  const source = new File(captureUri);
  if (!source.exists) throw new BestImageExportError('没有读取到导出的临时图片');
  const output = new File(Paths.cache, filename);
  try {
    if (output.exists) output.delete();
    source.copy(output);
    await MediaLibrary.saveToLibraryAsync(output.uri);
  } finally {
    if (output.exists) output.delete();
  }
}

export function deleteBestImageCapture(uri: string): void {
  const file = new File(uri);
  if (file.exists) file.delete();
}
