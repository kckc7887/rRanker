import { createInflightGuard, captureResourceWrites, resourceWriteGeneration } from '@/services/snapshot-cache-utils';
import { downloadChartResource } from '@/features/chart-download-shared/chart-download-shared';
import { loadImageDataUris } from '@/features/best-image/load-remote-image-data-uri';
import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';

/** 模块级只缓存短 file URI，禁止再持有 base64 data URI。 */
const cache = createInflightGuard<string>();
const disposedDirectories = new WeakSet<Directory>();

export function phigrosIllustrationStageDirectory(): Directory {
  const directory = new Directory(Paths.document, 'rranker', 'phigros-illustration-stage');
  directory.create({ intermediates: true, idempotent: true });
  disposedDirectories.delete(directory);
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
  disposedDirectories.delete(directory);
  return directory;
}

export function disposePhigrosIllustrationSession(directory: Directory): void {
  disposedDirectories.add(directory);
  if (directory.exists) directory.delete();
}

/** Documents/rranker —— WebView allowingReadAccess 覆盖字体与曲绘舞台。 */
export function phigrosReadableRootDirectory(): Directory {
  const directory = new Directory(Paths.document, 'rranker');
  directory.create({ intermediates: true, idempotent: true });
  return directory;
}

export function clearPhigrosIllustrationStage(): void {
  const directory = new Directory(Paths.document, 'rranker', 'phigros-illustration-stage');
  disposedDirectories.add(directory);
  if (directory.exists) directory.delete();
  cache.clear();
}

async function stageFileName(url: string, extensionOverride?: string): Promise<string> {
  const hash = (await digestStringAsync(CryptoDigestAlgorithm.SHA256, url)).slice(0, 32);
  const extensionMatch = /\.([a-zA-Z0-9]{2,5})(?:\?|$)/.exec(url);
  const extension = extensionOverride ?? extensionMatch?.[1]?.toLowerCase() ?? 'png';
  return `${hash}.${extension}`;
}

/**
 * 预取远程图到磁盘，再复制到可读舞台目录，返回 file:// URI。
 * 使用文件 URI，避免大型图片占用 JS 堆。
 */
export async function loadRemoteImageDataUri(
  url: string | null | undefined, directory: Directory = phigrosIllustrationStageDirectory(), signal?: AbortSignal,
): Promise<string | null> {
  if (!url || signal?.aborted || disposedDirectories.has(directory)) return null;
  const assertGeneration = captureResourceWrites('phigros');
  return cache.share(resourceWriteGeneration('phigros') + '|' + directory.uri + '|' + url, async (requestSignal) => {
    assertGeneration();
    const assertCurrent = captureResourceWrites('phigros', requestSignal);
    const name = await stageFileName(url);
    assertCurrent();
    const staged = new File(directory, name);
    if (staged.exists) return staged.uri;
    const temporaryName = 'rranker-best-image-session-' + Date.now() + '-' + (++illustrationSession) + '.tmp';
    const temporary = new File(Paths.cache, temporaryName);
    try {
      await downloadChartResource(Paths.cache, temporaryName, url, requestSignal);
      assertCurrent();
      if (disposedDirectories.has(directory)) return null;
      temporary.copy(staged);
      return staged.uri;
    } finally { if (temporary.exists) temporary.delete(); }
  }, signal).catch(() => null);
}
export function loadPhigrosIllustrations(
  songIds: readonly string[], urlFor: (songId: string) => string | null,
  onProgress?: (done: number, total: number) => void, directory?: Directory, signal?: AbortSignal,
): Promise<Record<string, string | null>> {
  return loadImageDataUris(songIds, urlFor, onProgress, signal, (url, requestSignal) => loadRemoteImageDataUri(url, directory, requestSignal));
}
