import { Directory } from 'expo-file-system';
import { invalidateResourceWrites } from '@/services/snapshot-cache-utils';
import { PHIGROS_UI_ROOT } from '@/features/storage-management/fs-storage';
import { prepareBestImageUi, type UiProgress } from '@/features/best-image/best-image-ui-cache';
import { PHIGROS_UI_ENTRIES, PHIGROS_UI_ZIP } from './phigros-ui-manifest';

export const PHIGROS_UI_CACHE_VERSION = 'v1';

export function preparePhigrosUi(onProgress?: (progress: UiProgress) => void, signal?: AbortSignal) {
  return prepareBestImageUi('phigros', new Directory(PHIGROS_UI_ROOT(), PHIGROS_UI_CACHE_VERSION),
    PHIGROS_UI_ENTRIES, PHIGROS_UI_ZIP, onProgress, signal);
}

export function clearPhigrosUiCache(): void {
  invalidateResourceWrites('phigros');
  const root = PHIGROS_UI_ROOT();
  if (root.exists) root.delete();
}
