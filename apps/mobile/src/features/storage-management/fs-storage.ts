import { Directory, File, Paths } from 'expo-file-system';

export { formatStorageBytes } from '@/features/storage-management/format-storage-bytes';

/** 递归统计目录占用；目录不存在或无法读取时返回 0。 */
export function measureDirectoryBytes(directory: Directory): number {
  try {
    if (!directory.exists) return 0;
    const info = directory.info();
    if (typeof info.size === 'number' && info.size >= 0) return info.size;
    let total = 0;
    for (const item of directory.list()) {
      if (item instanceof Directory) total += measureDirectoryBytes(item);
      else if (item instanceof File) total += item.size ?? 0;
    }
    return total;
  } catch {
    return 0;
  }
}

/** 删除目录内全部内容（保留目录本身）；用于 Paths.cache。 */
export function clearDirectoryContents(directory: Directory): void {
  try {
    if (!directory.exists) return;
    for (const item of directory.list()) {
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
