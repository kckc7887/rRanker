import { copyBestImageAsset, type BestImageAssetSession } from '@/features/best-image/load-best-image-session';
import {
  loadBestImageAssets,
  type BestImageEmbeddedAssets,
} from '@/features/best-image/load-best-image-assets';
import { loadBestImageJackets } from '@/features/best-image/load-best-image-jackets';
import {
  prepareMaimaiFonts,
  type MaimaiFontProgress,
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
import { MAIMAI_UI_MANIFEST_ENTRIES } from '@/features/best-image/maimai-ui-manifest.generated';
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
    loadBestImageAssets(session, FONT_SOURCE, frameSource, controller.signal).then(
      (assets) => {
        if (cancelled) return;
        readyRef.current = { session, frameSource };
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
    loadBestImageJackets(session, songIds, (completed, total) => {
      if (!cancelled) setCoverProgress({ completed, total });
    }, signal).then((nextCoverUrls) => {
      if (cancelled) return;
      readyRef.current = { session, key: coverRequestKey };
      setCoverUrls(nextCoverUrls);
    });
    return () => { cancelled = true; controller.abort(); };
  }, [session, coverRequestKey, lifecycle.foregroundGeneration, lifecycle.foregroundReady]);

  return { coverUrls, coverProgress };
}

export function useMaimaiExportAssets(session: BestImageAssetSession, lifecycle: ReturnType<typeof useAppLifecycle>, setAssetsDirectory: Dispatch<SetStateAction<Directory | null>>) {
  const [fontAttempt, setFontAttempt] = useState(0);
  const [assetsReady, setAssetsReady] = useState(false);
  const [fontProgress, setFontProgress] = useState<MaimaiFontProgress>({ phase: 'checking', completed: 0, total: 1, currentFont: null });
  const [uiProgress, setUiProgress] = useState<MaimaiUiProgress>({ phase: 'checking', completed: 0, total: 1, currentEntry: null });
  const [exportAssetError, setExportAssetError] = useState<string | null>(null);
  const readyRef = useRef<{ session: BestImageAssetSession; attempt: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!lifecycle.foregroundReady) return;
    if (readyRef.current?.session === session && readyRef.current.attempt === fontAttempt) return;
    readyRef.current = null;
    const controller = new AbortController();
    const assertCurrent = captureResourceWrites('maimai', controller.signal);
    setExportAssetError(null);
    setAssetsReady(false);
    void (async () => {
      const [font, ui] = await Promise.all([
        prepareMaimaiFonts((progress) => { if (!cancelled) setFontProgress(progress); }, controller.signal),
        prepareMaimaiUi((progress) => { if (!cancelled) setUiProgress(progress); }, controller.signal),
      ]);
      const results = await Promise.allSettled([font.fullReady, ui.fullReady]);
      const failed = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
      if (failed) throw failed.reason;
      assertCurrent();
      for (const entry of MAIMAI_UI_MANIFEST_ENTRIES) {
        const path = entry.path.replace(/^maimai-ui\//u, 'ui/');
        assertCurrent();
        await copyBestImageAsset(session, new File(ui.directory, path).uri, path, controller.signal);
      }
      if (!cancelled) {
        readyRef.current = { session, attempt: fontAttempt };
        setAssetsDirectory(session.directory);
        setAssetsReady(true);
      }
    })().catch((error) => {
      if (!cancelled) setExportAssetError(providerErrorToUserMessage(error, '无法准备成绩图片，请重试。'));
    });
    return () => { cancelled = true; controller.abort(); };
  }, [session, fontAttempt, lifecycle.foregroundGeneration, lifecycle.foregroundReady, setAssetsDirectory]);
  return { assetsReady, fontProgress, uiProgress, exportAssetError, setFontAttempt };
}
