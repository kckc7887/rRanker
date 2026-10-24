import { bestImageUiProgress } from '@/features/best-image/best-image-ui-cache';
import { File } from 'expo-file-system';
import { copyBestImageAsset, loadRemoteImageFile, type BestImageAssetSession } from '@/features/best-image/load-best-image-session';
import { useBestImageAssets } from '@/features/best-image/use-best-image-assets';
import type { BestImageTemplateAsset } from '@/features/best-image/use-best-image-screen-controller';
import { prepareChunithmUi } from './chunithm-ui-cache';
import { buildChunithmBestImageCardBackground } from './build-chunithm-best-image-html';
import type { ChunithmLevelIndex } from '@/domain/chunithm';

const CARD_DIFFICULTIES = ['basic', 'advanced', 'expert', 'master', 'ultima', 'worldsend'] as const;

export function useChunithmBestImageAssets(
  session: BestImageAssetSession,
  character: string | null,
  plate: string | null,
  trophy: string | null,
) {
  const drawing = useBestImageAssets({
    session,
    key: 'ui',
    prepare: async (signal, onProgress) => {
      const ui = await prepareChunithmUi(progress => onProgress(bestImageUiProgress(progress)), signal);
      await ui.fullReady;
      for (const path of ui.files) await copyBestImageAsset(session, new File(ui.directory, path).uri, path, signal);
      return true;
    },
  });
  const game = useBestImageAssets({
    session,
    key: JSON.stringify([character, plate, trophy]),
    prepare: async signal => {
      const [characterUrl, plateUrl, trophyUrl] = await Promise.all([character, plate, trophy].map(url => loadRemoteImageFile(session, url, signal)));
      return { character: characterUrl, plate: plateUrl, trophy: trophyUrl };
    },
  });
  return {
    assets: drawing.ready && game.ready ? game.data : null,
    drawingReady: drawing.ready,
    drawingProgress: drawing.progress,
    gameReady: game.ready,
    error: drawing.error ?? game.error,
    retry: () => { drawing.retry(); game.retry(); },
  };
}

export function buildChunithmCardBackgroundAssets(
  session: BestImageAssetSession,
  records: readonly { jacketId: string; levelIndex: ChunithmLevelIndex }[],
  coverUrls: Readonly<Record<string, string | null>>,
): BestImageTemplateAsset[] {
  return records.map(record => {
    const jacket = coverUrls[record.jacketId];
    const difficulty = CARD_DIFFICULTIES[record.levelIndex];
    const card = new File(session.directory, `card/${difficulty}.svg`).uri;
    return {
      id: `${record.jacketId}:${record.levelIndex}`,
      key: difficulty,
      sources: jacket ? [card, jacket] : [card],
      build: dataUrls => buildChunithmBestImageCardBackground(dataUrls[1] ?? null, dataUrls[0]!),
    };
  });
}
