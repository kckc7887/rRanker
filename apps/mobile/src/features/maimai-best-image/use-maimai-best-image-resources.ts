import { loadRemoteImageFile, copyBestImageAsset, retryBestImagePreparation, type BestImageAssetSession } from '@/features/best-image/load-best-image-session';
import {
  loadBestImageAssets,
  type BestImageEmbeddedAssets,
} from '@/features/best-image/load-best-image-assets';
import { loadBestImageJackets } from '@/features/best-image/load-best-image-jackets';
import {
  prepareMaimaiFonts,
  type MaimaiFontProgress,
  MAIMAI_FONT_MANIFEST,
} from '@/features/best-image/maimai-font-cache';
import {
  prepareMaimaiUi,
  type MaimaiUiProgress,
} from '@/features/best-image/maimai-ui-cache';
import {
  ratingFrameIndex
} from '@/features/maimai-best-image/build-maimai-best-image-html';
import { providerErrorToUserMessage } from '@/providers/errors';
import { useAppLifecycle } from '@/state/app-lifecycle';
import { File, type Directory } from 'expo-file-system';
import { captureResourceWrites } from '@/services/snapshot-cache-utils';
import type { BestImageRatingStyle } from '@/features/best-image/best-image-style-preferences';
import { useEffect, useRef, useState } from 'react';

import type { Dispatch, SetStateAction } from 'react';
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

export const FONT_PROGRESS_LABELS: Record<MaimaiFontProgress['phase'], string> = {
  checking: '正在检查导出字体',
  downloading: '正在下载导出字体',
  ready: '导出字体准备完成',
  error: '导出字体准备失败',
};

export function useMaimaiEmbeddedAssets(session: BestImageAssetSession, rating: number, lifecycle: ReturnType<typeof useAppLifecycle>) {
  const frameSource = RATING_FRAME_SOURCES[ratingFrameIndex(rating)]!;
  const [embeddedAssets, setEmbeddedAssets] = useState<BestImageEmbeddedAssets | null>(null);
  const [assetError, setAssetError] = useState<string | null>(null);
  const readyRef = useRef<{ session: BestImageAssetSession; frameSource: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!lifecycle.foregroundReady) return;
    if (readyRef.current?.session === session && readyRef.current.frameSource === frameSource) return;
    readyRef.current = null;
    const controller = new AbortController();
    setEmbeddedAssets(null);
    setAssetError(null);
    void loadBestImageAssets(session, FONT_SOURCE, frameSource, controller.signal).then(
      (assets) => {
        if (cancelled) return;
        readyRef.current = { session, frameSource };
        setAssetError(null);
        setEmbeddedAssets(assets);
      },
      () => { if (!cancelled) setAssetError('字体或 Rating 框加载失败'); },
    );
    return () => { cancelled = true; controller.abort(); };
  }, [session, frameSource, lifecycle.foregroundGeneration, lifecycle.foregroundReady]);

  return { embeddedAssets, assetError };
}

export function useMaimaiImageCovers(session: BestImageAssetSession, coverRequestKey: string, lifecycle: ReturnType<typeof useAppLifecycle>) {
  const [coverUrls, setCoverUrls] = useState<Record<string, string | null> | null>(null);
  const [coverProgress, setCoverProgress] = useState({ completed: 0, total: 0 });
  const readyRef = useRef<{ session: BestImageAssetSession; key: string } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;
    let cancelled = false;
    if (!lifecycle.foregroundReady) return;
    if (readyRef.current?.session === session && readyRef.current.key === coverRequestKey) return;
    readyRef.current = null;
    setCoverUrls(null);
    setCoverProgress({ completed: 0, total: 0 });
    const songIds = JSON.parse(coverRequestKey) as string[];
    void loadBestImageJackets(session, songIds, (completed, total) => {
      if (!cancelled) setCoverProgress({ completed, total });
    }, signal).then((nextCoverUrls) => {
      if (cancelled) return;
      readyRef.current = { session, key: coverRequestKey };
      setCoverUrls(nextCoverUrls);
    }).catch(() => undefined);
    return () => { cancelled = true; controller.abort(); };
  }, [session, coverRequestKey, lifecycle.foregroundGeneration, lifecycle.foregroundReady]);

  return { coverUrls, coverProgress };
}

export function useMaimaiCollectionAssets(session: BestImageAssetSession, requestKey: string, lifecycle: ReturnType<typeof useAppLifecycle>) {
  const [ready, setReady] = useState<{ session: BestImageAssetSession; key: string; urls: Record<'icon' | 'plate' | 'frame', string | null> } | null>(null);
  useEffect(() => {
    if (!lifecycle.foregroundReady) return;
    if (ready?.session === session && ready.key === requestKey) return;
    const controller = new AbortController();
    let cancelled = false;
    const requests = JSON.parse(requestKey) as [string | null, string | null, string | null];
    void Promise.all(requests.map(url => loadRemoteImageFile(session, url, controller.signal))).then(([icon, plate, frame]) => {
      if (!cancelled) setReady({ session, key: requestKey, urls: { icon, plate, frame } });
    }).catch(() => undefined);
    return () => { cancelled = true; controller.abort(); };
  }, [session, requestKey, lifecycle.foregroundReady, lifecycle.foregroundGeneration, ready]);
  return ready?.session === session && ready.key === requestKey ? ready.urls : null;
}

export function useMaimaiExportAssets(session: BestImageAssetSession, ratingStyle: BestImageRatingStyle, lifecycle: ReturnType<typeof useAppLifecycle>, setAssetsDirectory: Dispatch<SetStateAction<Directory | null>>) {
  const [fontAttempt, setFontAttempt] = useState(0);
  const [ready, setReady] = useState<{ session: BestImageAssetSession; style: BestImageRatingStyle; attempt: number } | null>(null);
  const [fontProgress, setFontProgress] = useState<MaimaiFontProgress>({ phase: 'checking', completed: 0, total: 1, currentFont: null });
  const [uiProgress, setUiProgress] = useState<MaimaiUiProgress>({ phase: 'checking', completed: 0, total: 1, currentEntry: null });
  const [exportAssetError, setExportAssetError] = useState<string | null>(null);
  const readyRef = useRef<{ session: BestImageAssetSession; style: BestImageRatingStyle; attempt: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!lifecycle.foregroundReady) return;
    if (readyRef.current?.session === session && readyRef.current.attempt === fontAttempt && readyRef.current.style === ratingStyle) return;
    readyRef.current = null;
    const controller = new AbortController();
    const assertCurrent = captureResourceWrites('maimai', controller.signal);
    setExportAssetError(null);
    setReady(null);
    setAssetsDirectory(null);
    setFontProgress({ phase: 'checking', completed: 0, total: 1, currentFont: null });
    setUiProgress({ phase: 'checking', completed: 0, total: 1, currentEntry: null });
    void retryBestImagePreparation(session, controller.signal, async () => {
      const [font, ui] = await Promise.all([
        ratingStyle === 'game' ? prepareMaimaiFonts((progress) => { if (!cancelled) setFontProgress(progress); }, controller.signal) : Promise.resolve(null),
        prepareMaimaiUi(ratingStyle, (progress) => { if (!cancelled) setUiProgress(progress); }, controller.signal),
      ]);
      const results = await Promise.allSettled([font?.fullReady, ui.fullReady]);
      const failed = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
      if (failed) throw failed.reason;
      assertCurrent();
      for (const path of ui.files) {
        assertCurrent();
        await copyBestImageAsset(session, new File(ui.directory, path).uri, path, controller.signal);
      }
      if (font) {
        for (const entry of MAIMAI_FONT_MANIFEST) {
          await copyBestImageAsset(session, new File(font.directory, 'font', entry.cssFileName).uri, entry.cssFileName, controller.signal);
        }
      }
      if (!cancelled) {
        readyRef.current = { session, style: ratingStyle, attempt: fontAttempt };
        setExportAssetError(null);
        setAssetsDirectory(session.directory);
        setReady(readyRef.current);
        if (ratingStyle === 'app') setFontProgress({ phase: 'ready', completed: 1, total: 1, currentFont: null });
      }
    }, (error) => {
      if (!cancelled) setExportAssetError(providerErrorToUserMessage(error, '素材准备失败，正在自动重试。'));
    }).catch(() => undefined);
    return () => { cancelled = true; controller.abort(); };
  }, [session, ratingStyle, fontAttempt, lifecycle.foregroundGeneration, lifecycle.foregroundReady, setAssetsDirectory]);
  return { assetsReady: ready?.session === session && ready.style === ratingStyle && ready.attempt === fontAttempt, fontProgress, uiProgress, exportAssetError, setFontAttempt };
}
