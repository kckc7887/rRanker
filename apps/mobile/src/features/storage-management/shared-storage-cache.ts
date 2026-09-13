import { invalidateResourceWrites } from '@/services/snapshot-cache-utils';
import { isBoundedCacheEntry, isLegacyRuntimeDiagnosticCacheEntry } from './cache-policy';
import { isExpoSystemCacheEntry } from './expo-system-cache';
import { clearDirectoryContentsStrict, measureDirectoryBytesAsync, APP_CACHE_ROOT } from './fs-storage';
import { reloadUiIconFonts } from './ui-icon-fonts';

function keepSharedCacheEntry(name: string): boolean {
  return isExpoSystemCacheEntry(name) || isBoundedCacheEntry(name) || isLegacyRuntimeDiagnosticCacheEntry(name);
}

export async function measureSharedCacheBytes(): Promise<number> {
  return measureDirectoryBytesAsync(APP_CACHE_ROOT(), { skip: keepSharedCacheEntry });
}

export async function clearSharedCache(): Promise<{ imageCacheCleared: boolean }> {
  invalidateResourceWrites('shared');
  // Preserve framework fonts and uncommitted diagnostic migration sources.
  clearDirectoryContentsStrict(APP_CACHE_ROOT(), { skip: keepSharedCacheEntry });
  const { Image } = await import('expo-image');
  const [disk, memory] = await Promise.all([
    Image.clearDiskCache().catch(() => false),
    Image.clearMemoryCache().catch(() => false),
  ]);
  const imageCacheCleared = disk === true || memory === true;
  await reloadUiIconFonts();
  return { imageCacheCleared };
}

export function sharedCacheNote(): string {
  return '临时文件与其它可重新下载的内容';
}
