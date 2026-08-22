/** expo-asset 下载到 Paths.cache 的系统资源（含 Ionicons 等图标字体），不可随共享缓存清除。 */
export function isExpoSystemCacheEntry(name: string): boolean {
  return name.startsWith('ExponentAsset-');
}

/** 应用自己写入 Paths.cache 的临时文件前缀（共享缓存只清这些）。 */
export { isTemporaryCacheEntry as isAppOwnedCacheEntry } from './cache-policy';

/** 可由共享清理器回收并纳入测量的缓存根；Image 为 expo-image 原生磁盘缓存。 */
export function isManagedClearableCacheEntry(name: string): boolean {
  return name === 'Image'
    || name === 'expo-image'
    || name.startsWith('rranker-')
    || name.startsWith('rRanker-');
}
