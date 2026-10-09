import { Directory, Paths } from 'expo-file-system';
import { deleteAsync, getInfoAsync, readDirectoryAsync } from 'expo-file-system/legacy';
import { COMPRESSED_IMAGE_CACHE_DIRECTORY_NAME } from '@/features/storage-management/cache-policy';

export { formatStorageBytes } from '@/features/storage-management/format-storage-bytes';
export {
  isAppOwnedCacheEntry,
  isExpoSystemCacheEntry,
} from '@/features/storage-management/expo-system-cache';

type DirectoryListOptions = {
  skip?: (name: string) => boolean;
  modifiedBefore?: number;
};

let sharedCacheFileOperations: Promise<unknown> = Promise.resolve();

export function runSharedCacheFileOperation<T>(operation: () => Promise<T>): Promise<T> {
  const pending = sharedCacheFileOperations.then(operation, operation);
  sharedCacheFileOperations = pending.catch(() => undefined);
  return pending;
}

async function measureDirectoryBytesInternal(
  directory: Directory,
  options?: DirectoryListOptions,
): Promise<number> {
  const skip = options?.skip;
  if (!skip) {
    const info = await getInfoAsync(directory.uri);
    return info.exists && typeof info.size === 'number' && info.size >= 0 ? info.size : 0;
  }
  const rootInfo = await getInfoAsync(directory.uri);
  if (!rootInfo.exists) return 0;
  let total = 0;
  for (const name of await readDirectoryAsync(directory.uri)) {
    if (skip(name)) continue;
    const info = await getInfoAsync(Paths.join(directory.uri, name));
    if (info.exists && typeof info.size === 'number' && info.size >= 0) total += info.size;
  }
  return total;
}

export async function measureDirectoryBytesAsync(
  directory: Directory,
  options?: DirectoryListOptions,
): Promise<number> {
  try {
    return await measureDirectoryBytesInternal(directory, options);
  } catch {
    return 0;
  }
}

export function measureDirectoryBytesStrictAsync(
  directory: Directory,
  options?: DirectoryListOptions,
): Promise<number> {
  return measureDirectoryBytesInternal(directory, options);
}

export async function clearDirectoryContents(
  directory: Directory,
  options?: DirectoryListOptions,
): Promise<void> {
  try {
    if (!(await getInfoAsync(directory.uri)).exists) return;
    const skip = options?.skip;
    for (const name of await readDirectoryAsync(directory.uri)) {
      if (skip?.(name)) continue;
      try {
        const uri = Paths.join(directory.uri, name);
        if (options?.modifiedBefore !== undefined) {
          const info = await getInfoAsync(uri);
          if (!info.exists || info.modificationTime >= options.modifiedBefore) continue;
        }
        if (!skip?.(name)) await deleteAsync(uri, { idempotent: true });
      } catch {

      }
    }
  } catch {

  }
}

export async function clearDirectoryContentsStrict(
  directory: Directory,
  options?: DirectoryListOptions,
): Promise<void> {
  if (!(await getInfoAsync(directory.uri)).exists) return;
  const skip = options?.skip;
  for (const name of await readDirectoryAsync(directory.uri)) {
    if (skip?.(name)) continue;
    const uri = Paths.join(directory.uri, name);
    if (options?.modifiedBefore !== undefined) {
      const info = await getInfoAsync(uri);
      if (!info.exists || info.modificationTime >= options.modifiedBefore) continue;
    }
    if (!skip?.(name)) await deleteAsync(uri, { idempotent: true });
  }
}

export async function pruneVersionedAssetRoot(root: Directory, currentVersions: readonly string[], modifiedBefore?: number): Promise<void> {
  if (!(await getInfoAsync(root.uri)).exists) return;
  for (const name of await readDirectoryAsync(root.uri)) {
    const uri = Paths.join(root.uri, name);
    const info = await getInfoAsync(uri);
    if (!info.exists || (modifiedBefore !== undefined && info.modificationTime >= modifiedBefore)) continue;
    if (!info.isDirectory || !currentVersions.includes(name)) {
      await deleteAsync(uri, { idempotent: true });
      continue;
    }
    const temporaryDirectory = new Directory(uri, 'tmp');
    await clearDirectoryContentsStrict(temporaryDirectory, { modifiedBefore });
  }
}

export const PHIGROS_FONT_ROOT = () => new Directory(Paths.document, 'rranker', 'phigros-fonts');
export const MAIMAI_ASSETS_ROOT = () => new Directory(Paths.document, 'rranker', 'maimai-assets');
export const PHIGROS_ILLUSTRATION_ROOT = () => new Directory(Paths.document, 'rranker', 'phigros-illustration-stage');
export const COMPRESSED_IMAGE_CACHE_ROOT = () => new Directory(Paths.cache, COMPRESSED_IMAGE_CACHE_DIRECTORY_NAME);
export const APP_CACHE_ROOT = () => new Directory(Paths.cache);
export const APP_DOCUMENT_ROOT = () => new Directory(Paths.document);
