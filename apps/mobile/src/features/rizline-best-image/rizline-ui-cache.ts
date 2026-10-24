import { Directory } from 'expo-file-system';
import { prepareBestImageUi, type UiProgress } from '@/features/best-image/best-image-ui-cache';
import { RIZLINE_UI_ROOT, clearDirectoryContentsStrict, runSharedCacheFileOperation } from '@/features/storage-management/fs-storage';
import { invalidateResourceWrites } from '@/services/snapshot-cache-utils';
import { RIZLINE_UI_ENTRIES, RIZLINE_UI_ZIP } from './rizline-ui-manifest';

export const RIZLINE_UI_CACHE_VERSION = RIZLINE_UI_ZIP.sha256;
export function prepareRizlineUi(onProgress?: (progress: UiProgress) => void, signal?: AbortSignal) {
  return prepareBestImageUi('rizline', new Directory(RIZLINE_UI_ROOT(), RIZLINE_UI_CACHE_VERSION),
    RIZLINE_UI_ENTRIES, RIZLINE_UI_ZIP, onProgress, signal);
}
export async function clearRizlineUiCache(): Promise<void> {
  invalidateResourceWrites('rizline');
  await runSharedCacheFileOperation(() => clearDirectoryContentsStrict(RIZLINE_UI_ROOT()));
}
