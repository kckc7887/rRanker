/** expo-asset 系统素材不随应用共享缓存清理。 */
export function isExpoSystemCacheEntry(name: string): boolean {
  return name.startsWith('ExponentAsset-');
}

export { isTemporaryCacheEntry as isAppOwnedCacheEntry } from './cache-policy';
