import type { BestImageRatingStyle } from './best-image-style-preferences';
import { invalidateResourceWrites } from '@/services/snapshot-cache-utils';
import { Directory, Paths } from 'expo-file-system';
import { prepareBestImageUi, type UiProgress, type PreparedUi } from './best-image-ui-cache';
import { MAIMAI_UI_MANIFEST_ENTRIES, MAIMAI_UI_ZIP, MAIMAI_APP_UI_ZIP, MAIMAI_APP_UI_MANIFEST_ENTRIES } from './maimai-ui-manifest.generated';

export const MAIMAI_UI_CACHE_VERSION = 'v1';
export type MaimaiUiProgress = UiProgress;
export type PreparedMaimaiUi = PreparedUi;

export function prepareMaimaiUi(style: BestImageRatingStyle, onProgress?: (progress: MaimaiUiProgress) => void, signal?: AbortSignal): Promise<PreparedMaimaiUi> {
  const directory = new Directory(Paths.document, 'rranker', 'maimai-assets', MAIMAI_UI_CACHE_VERSION, ...(style === 'app' ? ['app'] : []));
  const entries = style === 'app' ? MAIMAI_APP_UI_MANIFEST_ENTRIES : MAIMAI_UI_MANIFEST_ENTRIES;
  return prepareBestImageUi('maimai', directory, entries.map(entry => ({ ...entry, targetPath: entry.path.replace(/^maimai-ui\//u, 'ui/') })), style === 'app' ? MAIMAI_APP_UI_ZIP : MAIMAI_UI_ZIP, onProgress, signal);
}

export function clearMaimaiUiCache(): void {
  invalidateResourceWrites('maimai');
  const root = new Directory(Paths.document, 'rranker', 'maimai-assets');
  if (root.exists) root.delete();
}
