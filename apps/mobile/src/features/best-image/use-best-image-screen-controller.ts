import { useEffect, useMemo, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from 'react';
import type { View } from 'react-native';
import type { Directory } from 'expo-file-system';
import type { BestImageWebViewState } from './best-image-webview-state';
import { prepareBestImageWebViewSources, type BestImageWebViewSource } from './prepare-best-image-webview-sources';
import type { BestImageScreenControllerConfig } from './best-image-controller-types';
import { useBestImagePreferences } from './use-best-image-preferences';
import { useBestImagePreview } from './use-best-image-preview';
import { useBestImageExport } from './use-best-image-export';
import { createBestImageAssetSession, disposeBestImageAssetSession, invalidateBestImageAssetSession, retainBestImageAssetSession } from './load-best-image-session';
export type { BestImageScreenControllerConfig, BestImageScreenControllerRuntime } from './best-image-controller-types';

export function usePreparedBestImageSources(
  htmlPages: readonly string[] | null,
  directory: Directory | null,
  cancelExportRequest: () => Promise<void>,
  generation: unknown = htmlPages,
) {
  const pagesRef = useRef(htmlPages);
  pagesRef.current = htmlPages;
  const [result, setResult] = useState<{
    generation: unknown; directory: Directory; sources: BestImageWebViewSource[] | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setError(null);
    const pages = pagesRef.current;
    if (!pages || !directory) return;
    const controller = new AbortController();
    let cancelled = false;
    let release: Promise<void> | null = null;
    let prepared: Awaited<ReturnType<typeof prepareBestImageWebViewSources>> | null = null;
    void prepareBestImageWebViewSources(pages, directory, controller.signal).then(async (next) => {
      prepared = next;
      if (cancelled) { await release; await next.dispose(); return; }
      setResult({ generation, directory, sources: next.sources });
    }).catch(() => { if (!cancelled) setError('无法准备成绩图片，请重试。'); });
    return () => {
      cancelled = true;
      controller.abort();
      release = cancelExportRequest();
      if (prepared) void release.then(() => prepared!.dispose()).catch(() => {});
    };
  }, [directory, generation, cancelExportRequest]);
  const sources = result && result.generation === generation && result.directory === directory ? result.sources : null;
  return { sources, error };
}

export function useBestImageScreenController<TType extends string, TPrefs, TPicker>(
  config: BestImageScreenControllerConfig<TType, TPrefs>,
) {
  const [width, setWidth] = useState(config.defaultWidth);
  const [type, setType] = useState<TType>(config.defaultType);
  const [quantityText, setQuantityText] = useState(config.defaultQuantityText);
  const [picker, setPicker] = useState<TPicker | null>(null);
  const preferences = useBestImagePreferences(config);
  const preview = useBestImagePreview(width, config.messageScale, config.previewRenderingGuard);
  const exporting = useBestImageExport({
    accountId: config.accountId, width, defaultHeight: config.defaultExportHeight(width),
    messageScale: config.messageScale, wrapExportPageError: config.wrapExportPageError, pageHeights: preview.pageHeights,
  });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 账号切换需开启独立素材会话。
  const assetSession = useMemo(() => createBestImageAssetSession(config.game), [config.accountId, config.game]);
  const { cancelExportRequest } = exporting;
  useEffect(() => {
    retainBestImageAssetSession(assetSession);
    return () => {
      invalidateBestImageAssetSession(assetSession);
      void cancelExportRequest().then(() => disposeBestImageAssetSession(assetSession)).catch(() => {});
    };
  }, [assetSession, cancelExportRequest]);
  return { assetSession, width, setWidth, type, setType, quantityText, setQuantityText, picker, setPicker, ...preferences, ...preview, ...exporting };
}

export type BestImagePageHeightsSetter = Dispatch<SetStateAction<Record<string, number>>>;
export type BestImagePreviewStatesSetter = Dispatch<SetStateAction<Record<string, BestImageWebViewState>>>;
export type BestImageCaptureRef = RefObject<View | null>;
