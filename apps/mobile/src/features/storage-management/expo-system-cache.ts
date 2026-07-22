/** expo-asset 下载到 Paths.cache 的系统资源（含 Ionicons 等图标字体），不可随共享缓存清除。 */
export function isExpoSystemCacheEntry(name: string): boolean {
  return name.startsWith('ExponentAsset-');
}

/** 应用自己写入 Paths.cache 的临时文件前缀（共享缓存只清这些）。 */
export function isAppOwnedCacheEntry(name: string): boolean {
  return name.startsWith('rranker-') || name.startsWith('rRanker-');
}
