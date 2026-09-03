import { Directory, Paths } from 'expo-file-system';
import { isAppOwnedCacheEntry } from '@/features/storage-management/expo-system-cache';
import { COMPRESSED_IMAGE_CACHE_DIRECTORY_NAME } from '@/features/storage-management/cache-policy';

export { formatStorageBytes } from '@/features/storage-management/format-storage-bytes';
export {
  isAppOwnedCacheEntry,
  isExpoSystemCacheEntry,
} from '@/features/storage-management/expo-system-cache';

type DirectoryListOptions = {
  /** 按条目名跳过（不计入体积 / 不删除） */
  skip?: (name: string) => boolean;
};

async function measureDirectoryBytesInternal(
  directory: Directory,
  options?: DirectoryListOptions,
): Promise<number> {
  const { getInfoAsync } = await import('expo-file-system/legacy');
  const skip = options?.skip;
  if (!skip) {
    const info = await getInfoAsync(directory.uri);
    return info.exists && typeof info.size === 'number' && info.size >= 0 ? info.size : 0;
  }
  const entries = directory.list().filter((item) => !skip(item.name));
  const sizes = await Promise.all(entries.map(async (item) => {
    const info = await getInfoAsync(item.uri);
    return info.exists && typeof info.size === 'number' && info.size >= 0 ? info.size : 0;
  }));
  return sizes.reduce((sum, bytes) => sum + bytes, 0);
}

/** 异步统计物理占用；目录不存在或无法读取时返回 0。 */
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

/** 清理前后实际释放量使用：读取失败向上抛出，避免伪造 0。 */
export function measureDirectoryBytesStrictAsync(
  directory: Directory,
  options?: DirectoryListOptions,
): Promise<number> {
  return measureDirectoryBytesInternal(directory, options);
}

/** 删除目录内内容（保留目录本身）；可通过 skip 保留系统资源。 */
export function clearDirectoryContents(
  directory: Directory,
  options?: DirectoryListOptions,
): void {
  try {
    if (!directory.exists) return;
    const skip = options?.skip;
    for (const item of directory.list()) {
      if (skip?.(item.name)) continue;
      try {
        item.delete();
      } catch {
        // 忽略单个文件删除失败，尽量继续清理
      }
    }
  } catch {
    // ignore
  }
}

/** 迁移与生命周期清理使用：任一条目删除失败时向上抛出，避免误报成功。 */
export function clearDirectoryContentsStrict(
  directory: Directory,
  options?: DirectoryListOptions,
): void {
  if (!directory.exists) return;
  const skip = options?.skip;
  for (const item of directory.list()) {
    if (skip?.(item.name)) continue;
    item.delete();
  }
}

/** 仅保留当前版本目录，并清除当前版本内的下载临时目录。 */
export function pruneVersionedAssetRoot(root: Directory, currentVersions: readonly string[]): void {
  if (!root.exists) return;
  for (const item of root.list()) {
    if (!(item instanceof Directory) || !currentVersions.includes(item.name)) {
      item.delete();
      continue;
    }
    const temporaryDirectory = new Directory(item, 'tmp');
    if (temporaryDirectory.exists) clearDirectoryContentsStrict(temporaryDirectory);
  }
}

/**
 * 只删除应用自有的缓存文件，绝不碰 ExponentAsset-* 等系统资源。
 * 整目录清空 Paths.cache 会破坏 @expo/vector-icons 字体。
 */
export function clearAppOwnedCacheContents(directory: Directory = APP_CACHE_ROOT()): void {
  clearDirectoryContents(directory, {
    skip: (name) => !isAppOwnedCacheEntry(name),
  });
}

export function clearAppOwnedCacheContentsStrict(directory: Directory = APP_CACHE_ROOT()): void {
  clearDirectoryContentsStrict(directory, {
    skip: (name) => !isAppOwnedCacheEntry(name),
  });
}

export const PHIGROS_FONT_ROOT = () => new Directory(Paths.document, 'rranker', 'phigros-fonts');
export const MAIMAI_ASSETS_ROOT = () => new Directory(Paths.document, 'rranker', 'maimai-assets');
export const PHIGROS_ILLUSTRATION_ROOT = () => new Directory(Paths.document, 'rranker', 'phigros-illustration-stage');
export const OSU_MOD_ICONS_ROOT = () => new Directory(Paths.document, 'rranker', 'osu-mod-icons');
export const COMPRESSED_IMAGE_CACHE_ROOT = () => new Directory(Paths.cache, COMPRESSED_IMAGE_CACHE_DIRECTORY_NAME);
export const APP_CACHE_ROOT = () => new Directory(Paths.cache);
export const APP_DOCUMENT_ROOT = () => new Directory(Paths.document);
