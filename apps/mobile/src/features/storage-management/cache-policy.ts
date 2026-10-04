export const COMPRESSED_IMAGE_CACHE_DIRECTORY_NAME = 'rranker-remote-image-cache-v2';
export const RUNTIME_DIAGNOSTIC_STORE_FILE_NAME = 'rranker-runtime-diagnostics.json';

export function isTemporaryCacheEntry(name: string): boolean {
  return !isBoundedCacheEntry(name) && (name.startsWith('rranker-') || name.startsWith('rRanker-'));
}

export function isBoundedCacheEntry(name: string): boolean {
  return name === COMPRESSED_IMAGE_CACHE_DIRECTORY_NAME;
}
