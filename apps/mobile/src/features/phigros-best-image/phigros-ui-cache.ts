import type { ScoreRecord } from '@/domain/models';
import type { BestImageAssetSession } from '@/features/best-image/load-best-image-session';
import type { BestImageTemplateAsset } from '@/features/best-image/use-best-image-screen-controller';
import { buildPhigrosAppCardBackground } from './build-phigros-best-image-app-html';
import { Directory, File } from 'expo-file-system';
import { invalidateResourceWrites } from '@/services/snapshot-cache-utils';
import { PHIGROS_UI_ROOT } from '@/features/storage-management/fs-storage';
import { prepareBestImageUi, type UiProgress } from '@/features/best-image/best-image-ui-cache';
import { PHIGROS_UI_ENTRIES, PHIGROS_UI_ZIP } from './phigros-ui-manifest';
import { PHIGROS_APP_UI_ENTRIES, PHIGROS_APP_UI_ZIP } from './phigros-app-ui-manifest';
import type { BestImageRatingStyle } from '@/features/best-image/best-image-style-preferences';

export const PHIGROS_UI_CACHE_VERSION = 'v1';

export function preparePhigrosUi(style: BestImageRatingStyle, onProgress?: (progress: UiProgress) => void, signal?: AbortSignal) {
  return prepareBestImageUi('phigros', new Directory(PHIGROS_UI_ROOT(), PHIGROS_UI_CACHE_VERSION, ...(style === 'app' ? ['app'] : [])),
    style === 'app' ? PHIGROS_APP_UI_ENTRIES : PHIGROS_UI_ENTRIES,
    style === 'app' ? PHIGROS_APP_UI_ZIP : PHIGROS_UI_ZIP, onProgress, signal);
}

export function clearPhigrosUiCache(): void {
  invalidateResourceWrites('phigros');
  const root = PHIGROS_UI_ROOT();
  if (root.exists) root.delete();
}

const LEVELS = ['EZ', 'HD', 'IN', 'AT'] as const;
export function buildPhigrosAppCardAssets(session: BestImageAssetSession, records: readonly ScoreRecord[], illustrations: Readonly<Record<string, string | null>>): BestImageTemplateAsset[] {
  return records.map(record => {
    const level = record.levelIndex;
    const jacket = illustrations[record.songId];
    const card = new File(session.directory, `app/card/${LEVELS[level]}.svg`).uri;
    const mask = new File(session.directory, 'app/card/mask.svg').uri;
    return { id: `${record.songId}:${level}`, key: LEVELS[level]!, sources: jacket ? [card, mask, jacket] : [card, mask],
      build: urls => buildPhigrosAppCardBackground(urls[2] ?? null, urls[0]!, urls[1]!, level) };
  });
}
