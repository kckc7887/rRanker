import { invalidateResourceWrites } from '@/services/snapshot-cache-utils';
import { isBoundedCacheEntry } from './cache-policy';
import { isExpoSystemCacheEntry } from './expo-system-cache';
import { clearDirectoryContentsStrict, measureDirectoryBytesAsync, APP_CACHE_ROOT } from './fs-storage';
import { reloadUiIconFonts } from './ui-icon-fonts';
import { recordRuntimeError } from '@/services/runtime-diagnostics-recorder';

function keepSharedCacheEntry(name: string): boolean {
  return isExpoSystemCacheEntry(name) || isBoundedCacheEntry(name);
}

export async function measureSharedCacheBytes(): Promise<number> {
  return measureDirectoryBytesAsync(APP_CACHE_ROOT(), { skip: keepSharedCacheEntry });
}

export async function clearSharedCache(): Promise<{ imageCacheCleared: boolean; failures: string[] }> {
  invalidateResourceWrites('shared');
  clearDirectoryContentsStrict(APP_CACHE_ROOT(), { skip: keepSharedCacheEntry });
  const { Image } = await import('expo-image');
  const failures: string[] = [];
  const clearImageCache = async (load: () => Promise<boolean>, title: string, phase: string) => {
    try {
      if (await load() === true) return true;
      recordRuntimeError('storage-cache', new Error('原生图片缓存清理未完成'), false, { phase });
    } catch (error) { recordRuntimeError('storage-cache', error, false, { phase }); }
    failures.push(title);
    return false;
  };
  const [disk, memory] = await Promise.all([
    clearImageCache(() => Image.clearDiskCache(), '图片磁盘缓存', 'image-disk-clear'),
    clearImageCache(() => Image.clearMemoryCache(), '图片内存缓存', 'image-memory-clear'),
  ]);
  const imageCacheCleared = disk && memory;
  await reloadUiIconFonts();
  return { imageCacheCleared, failures };
}

export function sharedCacheNote(): string {
  return '临时文件与其它可重新下载的内容';
}
