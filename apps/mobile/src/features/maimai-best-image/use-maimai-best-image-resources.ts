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
import type { Directory } from 'expo-file-system';
import { useEffect, useState } from 'react';

import type { BestImageWebViewSource } from '@/features/best-image/prepare-best-image-webview-sources';
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

export function useMaimaiEmbeddedAssets(rating: number, lifecycle: ReturnType<typeof useAppLifecycle>) {
  const frameSource = RATING_FRAME_SOURCES[ratingFrameIndex(rating)]!;
  const [embeddedAssets, setEmbeddedAssets] = useState<BestImageEmbeddedAssets | null>(null);
  const [assetError, setAssetError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!lifecycle.foregroundReady) return;
    setEmbeddedAssets(null);
    setAssetError(null);
    loadBestImageAssets(FONT_SOURCE, frameSource).then(
      (assets) => { if (!cancelled) setEmbeddedAssets(assets); },
      () => { if (!cancelled) setAssetError('字体或 Rating 框加载失败'); },
    );
    return () => { cancelled = true; };
  }, [frameSource, lifecycle.foregroundGeneration, lifecycle.foregroundReady]);

  return { embeddedAssets, setEmbeddedAssets, assetError };
}

export function useMaimaiImageCovers(coverRequestKey: string, lifecycle: ReturnType<typeof useAppLifecycle>) {
  const [coverUrls, setCoverUrls] = useState<Record<string, string | null> | null>(null);
  const [coverProgress, setCoverProgress] = useState({ completed: 0, total: 0 });
  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;
    let cancelled = false;
    if (!lifecycle.foregroundReady) return;
    setCoverUrls(null);
    setCoverProgress({ completed: 0, total: 0 });
    const songIds = JSON.parse(coverRequestKey) as string[];
    loadBestImageJackets(songIds, (completed, total) => {
      if (!cancelled) setCoverProgress({ completed, total });
    }, signal).then((nextCoverUrls) => {
      if (!cancelled) setCoverUrls(nextCoverUrls);
    });
    return () => { cancelled = true; controller.abort(); };
  }, [coverRequestKey, lifecycle.foregroundGeneration, lifecycle.foregroundReady]);

  return { coverUrls, setCoverUrls, coverProgress };
}

export function useMaimaiExportAssets(lifecycle: ReturnType<typeof useAppLifecycle>, setAssetsDirectory: Dispatch<SetStateAction<Directory | null>>, setWebViewSources: Dispatch<SetStateAction<BestImageWebViewSource[] | null>>) {
  const [fontAttempt, setFontAttempt] = useState(0);
  const [assetsReady, setAssetsReady] = useState(false);
  const [fontProgress, setFontProgress] = useState<MaimaiFontProgress>({ phase: 'checking', completed: 0, total: 1, currentFont: null });
  const [uiProgress, setUiProgress] = useState<MaimaiUiProgress>({ phase: 'checking', completed: 0, total: 1, currentEntry: null });
  const [exportAssetError, setExportAssetError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!lifecycle.foregroundReady) return;
    const controller = new AbortController();
    setExportAssetError(null);
    setAssetsReady(false);
    setWebViewSources(null);
    void (async () => {
      const [font, ui] = await Promise.all([
        prepareMaimaiFonts((progress) => { if (!cancelled) setFontProgress(progress); }, controller.signal),
        prepareMaimaiUi((progress) => { if (!cancelled) setUiProgress(progress); }, controller.signal),
      ]);
      const results = await Promise.allSettled([font.fullReady, ui.fullReady]);
      const failed = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
      if (failed) throw failed.reason;
      if (!cancelled) {
        setAssetsDirectory(font.directory);
        setAssetsReady(true);
      }
    })().catch((error) => {
      if (!cancelled) setExportAssetError(providerErrorToUserMessage(error, '无法准备成绩图片，请重试。'));
    });
    return () => { cancelled = true; controller.abort(); };
  }, [fontAttempt, lifecycle.foregroundGeneration, lifecycle.foregroundReady, setAssetsDirectory, setWebViewSources]);
  return { assetsReady, fontProgress, uiProgress, exportAssetError, setFontAttempt };
}
