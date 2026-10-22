import { useEffect, useState } from 'react';
import { File } from 'expo-file-system';
import { copyBestImageAsset, loadRemoteImageFile, retryBestImagePreparation, type BestImageAssetSession } from '@/features/best-image/load-best-image-session';
import { useAppLifecycle } from '@/state/app-lifecycle';
import { captureResourceWrites } from '@/services/snapshot-cache-utils';
import { prepareChunithmUi } from './chunithm-ui-cache';

export function useChunithmBestImageAssets(session: BestImageAssetSession, character: string | null, plate: string | null, trophy: string | null) {
  const lifecycle = useAppLifecycle();
  const key = JSON.stringify([character, plate, trophy]);
  const [uiReady, setUiReady] = useState<BestImageAssetSession | null>(null);
  const [ready, setReady] = useState<{ session: BestImageAssetSession; key: string; character: string | null; plate: string | null; trophy: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!lifecycle.foregroundReady || uiReady === session) return;
    const controller = new AbortController();
    let cancelled = false;
    const assertCurrent = captureResourceWrites('chunithm', controller.signal);
    setError(null);
    void retryBestImagePreparation(session, controller.signal, async () => {
      const ui = await prepareChunithmUi(undefined, controller.signal);
      await ui.fullReady;
      for (const path of ui.files) {
        assertCurrent();
        await copyBestImageAsset(session, new File(ui.directory, path).uri, path, controller.signal);
      }
      if (!cancelled) { setError(null); setUiReady(session); }
    }, () => { if (!cancelled) setError('素材准备失败，正在自动重试'); }).catch(() => undefined);
    return () => { cancelled = true; controller.abort(); };
  }, [session, uiReady, lifecycle.foregroundReady, lifecycle.foregroundGeneration]);

  useEffect(() => {
    if (!lifecycle.foregroundReady || (ready?.session === session && ready.key === key)) return;
    const controller = new AbortController();
    let cancelled = false;
    const urls = JSON.parse(key) as (string | null)[];
    void Promise.all(urls.map(url => loadRemoteImageFile(session, url, controller.signal))).then(([characterUrl, plateUrl, trophyUrl]) => {
      if (!cancelled) setReady({ session, key, character: characterUrl, plate: plateUrl, trophy: trophyUrl });
    }).catch(() => undefined);
    return () => { cancelled = true; controller.abort(); };
  }, [session, key, lifecycle.foregroundReady, lifecycle.foregroundGeneration, ready]);
  return { assets: uiReady === session && ready?.session === session && ready.key === key ? ready : null, error };
}
