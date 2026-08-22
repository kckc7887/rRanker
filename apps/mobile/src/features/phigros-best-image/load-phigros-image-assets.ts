import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';

/** 模块级只缓存短 file URI，禁止再持有 base64 data URI。 */
const cache = new Map<string, Promise<string | null>>();

export function phigrosIllustrationStageDirectory(): Directory {
  const directory = new Directory(Paths.document, 'rranker', 'phigros-illustration-stage');
  directory.create({ intermediates: true, idempotent: true });
  return directory;
}

let illustrationSession = 0;

export function createPhigrosIllustrationSessionDirectory(): Directory {
  illustrationSession += 1;
  const directory = new Directory(
    phigrosIllustrationStageDirectory(),
    `session-${Date.now()}-${illustrationSession}`,
  );
  directory.create({ intermediates: true, idempotent: true });
  return directory;
}

export function disposePhigrosIllustrationSession(directory: Directory): void {
  if (directory.exists) directory.delete();
  for (const key of cache.keys()) {
    if (key.startsWith(`${directory.uri}|`)) cache.delete(key);
  }
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
 * 使用文件 URI，避免大型图片占用 JS 堆。
 */
export async function loadRemoteImageDataUri(
  url: string | null | undefined,
  directory: Directory = phigrosIllustrationStageDirectory(),
): Promise<string | null> {
  if (!url) return null;
  const cacheKey = `${directory.uri}|${url}`;
  const existing = cache.get(cacheKey);
  if (existing) return existing;
  const pending = (async () => {
    const staged = new File(directory, await stageFileName(url));
    if (!staged.exists) await File.downloadFileAsync(url, staged, { idempotent: true });
    return staged.uri;
  })();
  cache.set(cacheKey, pending);
  try {
    return await pending;
  } catch {
    cache.delete(cacheKey);
    return null;
  }
}

export async function loadPhigrosIllustrations(
  songIds: readonly string[],
  urlFor: (songId: string) => string | null,
  onProgress?: (done: number, total: number) => void,
  directory?: Directory,
): Promise<Record<string, string | null>> {
  const unique = [...new Set(songIds)];
  const result: Record<string, string | null> = {};
  onProgress?.(0, unique.length);
  for (const [index, id] of unique.entries()) {
    result[id] = await loadRemoteImageDataUri(urlFor(id), directory);
    onProgress?.(index + 1, unique.length);
  }
  return result;
}
