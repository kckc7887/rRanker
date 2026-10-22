import { Directory, Paths } from 'expo-file-system';
import { invalidateResourceWrites } from '@/services/snapshot-cache-utils';
import { prepareBestImageUi, type UiProgress } from '@/features/best-image/best-image-ui-cache';
import { CHUNITHM_UI_ENTRIES, CHUNITHM_UI_ZIP } from './chunithm-ui-manifest';

export const CHUNITHM_UI_CACHE_VERSION = 'v1';

export function prepareChunithmUi(onProgress?: (progress: UiProgress) => void, signal?: AbortSignal) {
  return prepareBestImageUi('chunithm', new Directory(Paths.document, 'rranker', 'chunithm-assets', CHUNITHM_UI_CACHE_VERSION),
    CHUNITHM_UI_ENTRIES, CHUNITHM_UI_ZIP, onProgress, signal);
}

export function clearChunithmUiCache(): void {
  invalidateResourceWrites('chunithm');
  const root = new Directory(Paths.document, 'rranker', 'chunithm-assets');
  if (root.exists) root.delete();
}
