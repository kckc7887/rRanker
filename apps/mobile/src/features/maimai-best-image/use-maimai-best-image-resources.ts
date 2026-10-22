import { loadRemoteImageFile, copyBestImageAsset, type BestImageAssetSession } from '@/features/best-image/load-best-image-session';
import { loadBestImageAssets } from '@/features/best-image/load-best-image-assets';
import { loadBestImageJackets } from '@/features/best-image/load-best-image-jackets';
import { prepareMaimaiFonts, MAIMAI_FONT_MANIFEST } from '@/features/best-image/maimai-font-cache';
import { prepareMaimaiUi } from '@/features/best-image/maimai-ui-cache';
import { useBestImageAssets } from '@/features/best-image/use-best-image-assets';
import type { BestImageTemplateAsset } from '@/features/best-image/use-best-image-screen-controller';
import { buildMaimaiBestImageCardBackground, ratingFrameIndex } from '@/features/maimai-best-image/build-maimai-best-image-html';
import { File } from 'expo-file-system';
import type { BestImageRatingStyle } from '@/features/best-image/best-image-style-preferences';
import type { ScoreRecord } from '@/domain/models';

const FONT_SOURCE = require('../../../assets/rating/ariblk.ttf') as number;
const RATING_FRAME_SOURCES: number[] = [
  require('../../../assets/rating/rating_base_01.png'),
  require('../../../assets/rating/rating_base_02.png'),
  require('../../../assets/rating/rating_base_03.png'),
  require('../../../assets/rating/rating_base_04.png'),
  require('../../../assets/rating/rating_base_05.png'),
  require('../../../assets/rating/rating_base_06.png'),
  require('../../../assets/rating/rating_base_07.png'),
  require('../../../assets/rating/rating_base_08.png'),
  require('../../../assets/rating/rating_base_09.png'),
  require('../../../assets/rating/rating_base_10.png'),
  require('../../../assets/rating/rating_base_11.png'),
];

export function useMaimaiEmbeddedAssets(session: BestImageAssetSession, rating: number) {
  const frameSource = RATING_FRAME_SOURCES[ratingFrameIndex(rating)]!;
  const assets = useBestImageAssets({ session, key: String(frameSource),
    prepare: (signal) => loadBestImageAssets(session, FONT_SOURCE, frameSource, signal) });
  return { embeddedAssets: assets.data, assetError: assets.error, retry: assets.retry };
}

export function useMaimaiImageCovers(session: BestImageAssetSession, key: string) {
  const assets = useBestImageAssets({ session, key,
    prepare: (signal) => loadBestImageJackets(session, JSON.parse(key) as string[], undefined, signal) });
  return { coverUrls: assets.data, coverError: assets.error, retry: assets.retry };
}

export function buildMaimaiCardBackgroundAssets(
  records: readonly Pick<ScoreRecord, 'songId' | 'difficulty'>[],
  coverUrls: Readonly<Record<string, string | null>>,
): BestImageTemplateAsset[] {
  return records.map(record => {
    const jacket = coverUrls[record.songId];
    return {
      id: `${record.songId}:${record.difficulty}`,
      key: record.difficulty,
      sources: jacket ? [jacket] : [],
      build: dataUrls => buildMaimaiBestImageCardBackground(dataUrls[0] ?? null, record.difficulty),
    };
  });
}

export function useMaimaiCollectionAssets(session: BestImageAssetSession, key: string) {
  const assets = useBestImageAssets({ session, key, prepare: async (signal) => {
    const urls = JSON.parse(key) as (string | null)[];
    const [icon, plate, frame] = await Promise.all(urls.map(url => loadRemoteImageFile(session, url, signal)));
    return { icon, plate, frame };
  } });
  return { collectionUrls: assets.data, collectionError: assets.error, retry: assets.retry };
}

export function useMaimaiExportAssets(session: BestImageAssetSession, style: BestImageRatingStyle) {
  const assets = useBestImageAssets({ session, key: style, prepare: async (signal) => {
    const [font, ui] = await Promise.all([
      style === 'game' ? prepareMaimaiFonts(undefined, signal) : Promise.resolve(null),
      prepareMaimaiUi(style, undefined, signal),
    ]);
    await Promise.all([font?.fullReady, ui.fullReady]);
    for (const path of ui.files) {
      await copyBestImageAsset(session, new File(ui.directory, path).uri, path, signal);
    }
    if (font) {
      for (const entry of MAIMAI_FONT_MANIFEST) {
        await copyBestImageAsset(session, new File(font.directory, 'font', entry.cssFileName).uri, entry.cssFileName, signal);
      }
    }
    return session.directory;
  } });
  return { assetsReady: assets.ready, assetsDirectory: assets.data, exportAssetError: assets.error, retry: assets.retry };
}
