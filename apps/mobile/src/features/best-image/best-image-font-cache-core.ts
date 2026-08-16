import { CryptoDigestAlgorithm, digest } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';

/** 字体缓存清单条目的公共字段：缓存校验与 inflight 防重只依赖这些稳定语义。 */
export type FontCacheManifestEntry = {
  /** 字体条目名，同时是 inflight 防重键。 */
  name: string;
  /** 缓存目录中的文件名（HTML @font-face 相对路径引用）。 */
  cssFileName: string;
  /** 最终字体文件的精确字节数。 */
  fontBytes: number;
  /** 最终字体文件的 sha256（十六进制小写）。 */
  fontSha256: string;
};

/** 字体缓存三级目录：版本根目录、font 最终目录、tmp 临时目录。 */
export type FontCacheDirectories = {
  directory: Directory;
  fontDirectory: Directory;
  temporaryDirectory: Directory;
};

export function bytesToHex(value: ArrayBuffer): string {
  return Array.from(new Uint8Array(value), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function sha256(bytes: Uint8Array): Promise<string> {
  const stableBytes = new Uint8Array(bytes.byteLength);
  stableBytes.set(bytes);
  return bytesToHex(await digest(CryptoDigestAlgorithm.SHA256, stableBytes));
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** 创建 Documents/rranker/<assetDirectoryName>/<cacheVersion> 缓存目录骨架（font/tmp）。 */
export function createFontCacheDirectories(
  assetDirectoryName: string,
  cacheVersion: string,
): () => FontCacheDirectories {
  return () => {
    const directory = new Directory(Paths.document, 'rranker', assetDirectoryName, cacheVersion);
    const fontDirectory = new Directory(directory, 'font');
    const temporaryDirectory = new Directory(directory, 'tmp');
    directory.create({ intermediates: true, idempotent: true });
    fontDirectory.create({ intermediates: true, idempotent: true });
    temporaryDirectory.create({ intermediates: true, idempotent: true });
    return { directory, fontDirectory, temporaryDirectory };
  };
}

/** 清除 Documents/rranker/<assetDirectoryName> 字体缓存目录（含全部版本子目录）。 */
export function clearFontCacheDirectory(assetDirectoryName: string): void {
  const root = new Directory(Paths.document, 'rranker', assetDirectoryName);
  if (root.exists) root.delete();
}

/**
 * 创建带 inflight 防重的字体确保器：缓存命中（大小 + sha256）直接复用；未命中时经
 * downloadFont 钩子下载，各游戏的下载/解压/校验差异由钩子表达；同名条目并发请求
 * 共享同一个 Promise，结束后自动清理。
 */
export function createFontCacheGuard<Entry extends FontCacheManifestEntry>(options: {
  downloadFont: (
    entry: Entry,
    fontDirectory: Directory,
    temporaryDirectory: Directory,
  ) => Promise<File>;
}): {
  ensureFont: (
    entry: Entry,
    fontDirectory: Directory,
    temporaryDirectory: Directory,
    onDownloadStart: () => void,
  ) => Promise<File>;
} {
  const inFlightFonts = new Map<string, Promise<File>>();

  async function isValidFont(file: File, entry: Entry): Promise<boolean> {
    if (!file.exists || file.size !== entry.fontBytes) return false;
    return await sha256(await file.bytes()) === entry.fontSha256;
  }

  async function ensureFont(
    entry: Entry,
    fontDirectory: Directory,
    temporaryDirectory: Directory,
    onDownloadStart: () => void,
  ): Promise<File> {
    const file = new File(fontDirectory, entry.cssFileName);
    if (await isValidFont(file, entry)) return file;
    if (file.exists) file.delete();
    const existing = inFlightFonts.get(entry.name);
    if (existing) return existing;
    onDownloadStart();
    const pending = options.downloadFont(entry, fontDirectory, temporaryDirectory)
      .finally(() => inFlightFonts.delete(entry.name));
    inFlightFonts.set(entry.name, pending);
    return pending;
  }

  return { ensureFont };
}
