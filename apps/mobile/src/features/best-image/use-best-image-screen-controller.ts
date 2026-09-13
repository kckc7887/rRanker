import { useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from 'react';
import type { View } from 'react-native';
import type { Directory } from 'expo-file-system';
import type { BestImageWebViewState } from './best-image-webview-state';
import { inlineBestImageWebViewSources, prepareBestImageWebViewSources, type BestImageWebViewSource } from './prepare-best-image-webview-sources';
import type { BestImageScreenControllerConfig } from './best-image-controller-types';
import { useBestImagePreferences } from './use-best-image-preferences';
import { useBestImagePreview } from './use-best-image-preview';
import { useBestImageExport } from './use-best-image-export';
export type { BestImageScreenControllerConfig, BestImageScreenControllerRuntime } from './best-image-controller-types';

/** Own the generated HTML files; disposal always follows the corresponding source generation. */
export function usePreparedBestImageSources(
  htmlPages: readonly string[] | null,
  directory?: Directory | null,
  inline = false,
  generation: unknown = htmlPages,
) {
  const pagesRef = useRef(htmlPages);
  pagesRef.current = htmlPages;
  const [sources, setSources] = useState<BestImageWebViewSource[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setSources(null); setError(null);
    const pages = pagesRef.current;
    if (!pages || (!inline && directory === null)) return;
    if (inline) { setSources(inlineBestImageWebViewSources(pages)); return; }
    try {
      const prepared = prepareBestImageWebViewSources(pages, directory ?? undefined);
      setSources(prepared.sources);
      return prepared.dispose;
    } catch { setError('无法准备成绩图片，请重试。'); }
  }, [directory, generation, inline]);
  return { sources, setSources, error };
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
  return { width, setWidth, type, setType, quantityText, setQuantityText, picker, setPicker, ...preferences, ...preview, ...exporting };
}

/** 控制器返回值中供骨架透传的类型别名（pageHeights / previewStates 的 setter 形态）。 */
export type BestImagePageHeightsSetter = Dispatch<SetStateAction<Record<string, number>>>;
export type BestImagePreviewStatesSetter = Dispatch<SetStateAction<Record<string, BestImageWebViewState>>>;
export type BestImageCaptureRef = RefObject<View | null>;
