import { Directory, File, Paths } from 'expo-file-system';

export { formatStorageBytes } from '@/features/storage-management/format-storage-bytes';
export { isExpoSystemCacheEntry } from '@/features/storage-management/expo-system-cache';

type DirectoryListOptions = {
  /** 按条目名跳过（不计入体积 / 不删除） */
  skip?: (name: string) => boolean;
};

/** 递归统计目录占用；目录不存在或无法读取时返回 0。 */
export function measureDirectoryBytes(
  directory: Directory,
  options?: DirectoryListOptions,
): number {
  try {
    if (!directory.exists) return 0;
    const skip = options?.skip;
    if (!skip) {
      const info = directory.info();
      if (typeof info.size === 'number' && info.size >= 0) return info.size;
    }
    let total = 0;
    for (const item of directory.list()) {
      if (skip?.(item.name)) continue;
      if (item instanceof Directory) total += measureDirectoryBytes(item, options);
      else if (item instanceof File) total += item.size ?? 0;
    }
    return total;
  } catch {
    return 0;
  }
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

export const PHIGROS_FONT_ROOT = () => new Directory(Paths.document, 'rranker', 'phigros-fonts');
export const APP_CACHE_ROOT = () => new Directory(Paths.cache);
