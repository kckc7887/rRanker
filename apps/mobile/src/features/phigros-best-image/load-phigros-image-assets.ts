import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { Image } from 'expo-image';
import { imageCachePathToFileUri } from '@/features/best-image/load-best-image-jackets';

/** 模块级只缓存短 file URI，禁止再持有 base64 data URI。 */
const cache = new Map<string, Promise<string | null>>();

export function phigrosIllustrationStageDirectory(): Directory {
  const directory = new Directory(Paths.document, 'rranker', 'phigros-illustration-stage');
  directory.create({ intermediates: true, idempotent: true });
  return directory;
}

/** Documents/rranker —— WebView allowingReadAccess 覆盖字体与曲绘舞台。 */
export function phigrosReadableRootDirectory(): Directory {
  const directory = new Directory(Paths.document, 'rranker');
  directory.create({ intermediates: true, idempotent: true });
  return directory;
}

export function clearPhigrosIllustrationStage(): void {
  const directory = new Directory(Paths.document, 'rranker', 'phigros-illustration-stage');
  if (directory.exists) directory.delete();
  cache.clear();
}

async function stageFileName(url: string): Promise<string> {
  const hash = (await digestStringAsync(CryptoDigestAlgorithm.SHA256, url)).slice(0, 32);
  const extensionMatch = /\.([a-zA-Z0-9]{2,5})(?:\?|$)/.exec(url);
  const extension = extensionMatch?.[1]?.toLowerCase() ?? 'png';
  return `${hash}.${extension}`;
}

/**
 * 预取远程图到磁盘，再复制到可读舞台目录，返回 file:// URI。
 * 不再读成 base64，避免成绩图曲绘在 JS 堆中膨胀。
 */
export async function loadRemoteImageDataUri(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  const existing = cache.get(url);
  if (existing) return existing;
  const pending = (async () => {
    let path = await Image.getCachePathAsync(url);
    if (!path && await Image.prefetch(url, 'disk')) path = await Image.getCachePathAsync(url);
    if (!path) return null;
    const source = new File(imageCachePathToFileUri(path));
    if (!source.exists) return null;
    const staged = new File(phigrosIllustrationStageDirectory(), await stageFileName(url));
    if (!staged.exists) source.copy(staged);
    return staged.uri;
  })();
  cache.set(url, pending);
  try {
    return await pending;
  } catch {
    cache.delete(url);
    return null;
  }
}

export async function loadPhigrosIllustrations(
  songIds: readonly string[],
  urlFor: (songId: string) => string | null,
  onProgress?: (done: number, total: number) => void,
): Promise<Record<string, string | null>> {
  const unique = [...new Set(songIds)];
  const result: Record<string, string | null> = {};
  onProgress?.(0, unique.length);
  for (const [index, id] of unique.entries()) {
    result[id] = await loadRemoteImageDataUri(urlFor(id));
    onProgress?.(index + 1, unique.length);
  }
  return result;
}
