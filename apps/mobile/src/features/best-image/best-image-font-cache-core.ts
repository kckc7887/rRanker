import { sha256 } from '@/utils/resource-integrity';
import { Directory, File, Paths } from 'expo-file-system';
import { captureResourceWrites, createInflightGuard, resourceWriteGeneration } from '@/services/snapshot-cache-utils';
export { sha256, bytesToHex } from '@/utils/resource-integrity';

export type FontCacheManifestEntry = {

  name: string;

  cssFileName: string;

  fontBytes: number;

  fontSha256: string;
};

export type FontCacheDirectories = {
  directory: Directory;
  fontDirectory: Directory;
  temporaryDirectory: Directory;
};

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

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

export function clearFontCacheDirectory(assetDirectoryName: string): void {
  const root = new Directory(Paths.document, 'rranker', assetDirectoryName);
  if (root.exists) root.delete();
}

let fontDownloadSequence = 0;

export function createFontCacheGuard<Entry extends FontCacheManifestEntry>(options: {
  scope: string;
  downloadFont: (
    entry: Entry,
    fontDirectory: Directory,
    temporaryDirectory: Directory,
    signal: AbortSignal,
    assertCurrent: () => void,
  ) => Promise<File>;
}): {
  ensureFont: (
    entry: Entry,
    fontDirectory: Directory,
    temporaryDirectory: Directory,
    onDownloadStart: () => void,
    signal?: AbortSignal,
  ) => Promise<File>;
} {
  const inFlightFonts = createInflightGuard<string>();

  async function isValidFont(file: File, entry: Entry): Promise<boolean> {
    if (!file.exists || file.size !== entry.fontBytes) return false;
    return await sha256(await file.bytes()) === entry.fontSha256;
  }

  async function ensureFont(
    entry: Entry,
    fontDirectory: Directory,
    temporaryDirectory: Directory,
    onDownloadStart: () => void,
    signal?: AbortSignal,
  ): Promise<File> {
    const assertGeneration = captureResourceWrites(options.scope);
    const key = `${fontDirectory.uri}:${entry.fontSha256}:${resourceWriteGeneration(options.scope)}`;
    return inFlightFonts.share(key, async (requestSignal) => {
      assertGeneration();
      const assertCurrent = captureResourceWrites(options.scope, requestSignal);
      const file = new File(fontDirectory, entry.cssFileName);
      const valid = await isValidFont(file, entry);
      assertCurrent();
      if (valid) return file;
      onDownloadStart();
      const temporary = new Directory(Paths.cache, `rranker-font-${Date.now()}-${++fontDownloadSequence}`);
      temporary.create({ intermediates: true, idempotent: true });
      try { return await options.downloadFont(entry, fontDirectory, temporary, requestSignal, assertCurrent); }
      finally { if (temporary.exists) temporary.delete(); }
    }, signal);
  }

  return { ensureFont };
}
