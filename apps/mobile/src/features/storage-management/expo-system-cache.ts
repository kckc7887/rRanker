/** expo-asset 下载到 Paths.cache 的系统资源（含 Ionicons 等图标字体），不可随共享缓存清除。 */
export function isExpoSystemCacheEntry(name: string): boolean {
  return name.startsWith('ExponentAsset-');
}
