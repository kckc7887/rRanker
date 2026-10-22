import { File } from 'expo-file-system';
import { copyBestImageAsset, loadRemoteImageFile, type BestImageAssetSession } from '@/features/best-image/load-best-image-session';
import { useBestImageAssets } from '@/features/best-image/use-best-image-assets';
import { prepareChunithmUi } from './chunithm-ui-cache';

export function useChunithmBestImageAssets(session: BestImageAssetSession, character: string | null, plate: string | null, trophy: string | null) {
  const drawing = useBestImageAssets({
    session,
    key: 'ui',
    prepare: async signal => {
      const ui = await prepareChunithmUi(undefined, signal);
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
    gameReady: game.ready,
    error: drawing.error ?? game.error,
    retry: () => { drawing.retry(); game.retry(); },
  };
}
