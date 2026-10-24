import { useState } from 'react';
import { parseBestImageErrorMessage, parseBestImageHeightMessage, parseBestImageProgressMessage, parseBestImageReadyMessage, parseBestImageRuntimeMessage } from './best-image-messages';
import { recordRuntimeError } from '@/services/runtime-diagnostics-recorder';
import { updateBestImageWebViewRenderingState, updateBestImageWebViewState, type BestImageWebViewState } from './best-image-webview-state';

export function useBestImagePreview(width: number, messageScale: number | undefined, guard: boolean | undefined) {
  const [pageHeights, setPageHeights] = useState<Record<string, number>>({});
  const [pageIndex, setPageIndex] = useState(0);
  const [previewStates, setPreviewStates] = useState<Record<string, BestImageWebViewState>>({});
  const handlePreviewMessage = (data: string, pageId: string) => {
    const progress = parseBestImageProgressMessage(data, width);
    if (progress !== null) {
      setPreviewStates(current => ({ ...current, [pageId]: {
        phase: current[pageId]?.phase ?? 'rendering', version: current[pageId]?.version ?? null,
        progress: Math.max(current[pageId]?.progress ?? 0, progress),
      } }));
      return;
    }
    const error = parseBestImageErrorMessage(data, width);
    if (error !== null) {
      recordRuntimeError('best-image-preview', new Error(error));
      updateBestImageWebViewState(setPreviewStates, pageId, 'error');
      return;
    }
    const runtime = parseBestImageRuntimeMessage(data, width);
    if (runtime) {
      if (guard) updateBestImageWebViewRenderingState(setPreviewStates, pageId, runtime.version);
      else updateBestImageWebViewState(setPreviewStates, pageId, 'rendering', runtime.version);
    }
    const height = parseBestImageHeightMessage(data, width, messageScale);
    if (height !== null) {
      setPageHeights((current) => ({ ...current, [pageId]: height }));
      if (guard) updateBestImageWebViewRenderingState(setPreviewStates, pageId);
      else updateBestImageWebViewState(setPreviewStates, pageId, 'rendering');
    }
    if (parseBestImageReadyMessage(data, width, messageScale) !== null) updateBestImageWebViewState(setPreviewStates, pageId, 'ready');
  };
  return { pageHeights, setPageHeights, pageIndex, setPageIndex, previewStates, setPreviewStates, handlePreviewMessage };
}
