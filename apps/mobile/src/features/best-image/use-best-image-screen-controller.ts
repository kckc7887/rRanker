import { useEffect, useMemo, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from 'react';
import type { View } from 'react-native';
import type { Directory } from 'expo-file-system';
import type { BestImageWebViewState } from './best-image-webview-state';
import { prepareBestImageWebViewSources, type BestImageWebViewSource } from './prepare-best-image-webview-sources';
import type { BestImageScreenControllerConfig } from './best-image-controller-types';
import { useBestImagePreferences } from './use-best-image-preferences';
import { useBestImagePreview } from './use-best-image-preview';
import { useBestImageExport } from './use-best-image-export';
import { createBestImageAssetSession, disposeBestImageAssetSession, invalidateBestImageAssetSession, prepareBestImageCardBackground, retainBestImageAssetSession, retryBestImagePreparation, type BestImageAssetSession } from './load-best-image-session';
import { useBestImageAssets } from './use-best-image-assets';
import { useAppLifecycle } from '@/state/app-lifecycle';
import { recordRuntimeError } from '@/services/runtime-diagnostics-recorder';
import { captureResourceWrites } from '@/services/snapshot-cache-utils';
export type { BestImageScreenControllerConfig, BestImageScreenControllerRuntime } from './best-image-controller-types';

export type BestImageTemplateAsset = {
  id: string;
  key: string;
  sources: readonly string[];
  build: (dataUrls: readonly string[]) => string;
};

export type BestImageTemplate = {
  assets: readonly BestImageTemplateAsset[];
  build: (urls: Readonly<Record<string, string>>) => readonly string[];
};

export function usePreparedBestImageSources(
  template: BestImageTemplate | null,
  session: BestImageAssetSession,
  directory: Directory | null,
  cancelExportRequest: () => Promise<void>,
  generation: unknown = template,
) {
  const entries = useMemo(() => [...new Map(template?.assets.map(asset => [asset.id, asset])).values()]
    .sort((a, b) => a.id.localeCompare(b.id)), [template]);
  const assets = useBestImageAssets({ session,
    key: template ? JSON.stringify(entries.map(({ id, key, sources }) => [id, key, sources])) : null,
    prepare: async (signal) => {
      const urls: Record<string, string> = {};
      for (const entry of entries) {
        urls[entry.id] = await prepareBestImageCardBackground(session, entry.key, entry.sources, entry.build, signal);
      }
      return urls;
    },
  });
  const htmlPages = useMemo(() => template && assets.data ? template.build(assets.data) : null, [template, assets.data]);
  const sourceGeneration = useMemo(() => ({ generation, assets: assets.data }), [generation, assets.data]);
  const pagesRef = useRef(htmlPages);
  pagesRef.current = htmlPages;
  const { foregroundReady } = useAppLifecycle();
  const preparedRef = useRef<{
    generation: unknown; directory: Directory;
    value: Awaited<ReturnType<typeof prepareBestImageWebViewSources>>;
  } | null>(null);
  const [result, setResult] = useState<{
    generation: unknown; directory: Directory; sources: BestImageWebViewSource[] | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => () => {
    const prepared = preparedRef.current;
    if (!prepared || prepared.generation !== sourceGeneration || prepared.directory !== directory) return;
    preparedRef.current = null;
    void cancelExportRequest().then(() => prepared.value.dispose())
      .catch(error => recordRuntimeError('best-image-release', error, false, { phase: 'cleanup' }));
  }, [directory, sourceGeneration, cancelExportRequest]);
  useEffect(() => {
    const pages = pagesRef.current;
    if (!foregroundReady || !pages || !directory) return;
    const retained = preparedRef.current;
    if (retained && retained.generation === sourceGeneration && retained.directory === directory) return;
    setError(null);
    const controller = new AbortController();
    const assertCurrent = captureResourceWrites(session.game, controller.signal);
    let cancelled = false;
    void retryBestImagePreparation(session, controller.signal,
      async () => {
        const next = await prepareBestImageWebViewSources(pages, directory, controller.signal);
        try { assertCurrent(); return next; }
        catch (error) { await next.dispose(); throw error; }
      },
      () => { if (!cancelled) setError('成绩图片准备失败，正在自动重试。'); },
    ).then(async (next) => {
      if (cancelled || session.disposed) { await next.dispose(); return; }
      preparedRef.current = { generation: sourceGeneration, directory, value: next };
      setError(null);
      setResult({ generation: sourceGeneration, directory, sources: next.sources });
    }).catch(error => { if (!cancelled) recordRuntimeError('best-image-prepare', error); });
    return () => { cancelled = true; controller.abort(); };
  }, [directory, sourceGeneration, foregroundReady, session]);
  const sources = htmlPages && result && result.generation === sourceGeneration && result.directory === directory ? result.sources : null;
  return { htmlPages, sources, ready: assets.ready, error: assets.error ?? error, retry: assets.retry };
}

export function useBestImageScreenController<TType extends string, TPrefs extends object, TPicker>(
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
