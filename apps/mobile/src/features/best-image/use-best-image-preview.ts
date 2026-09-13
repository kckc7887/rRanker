import { useState } from 'react';
import { parseBestImageHeightMessage, parseBestImageReadyMessage, parseBestImageRuntimeMessage } from './best-image-messages';
import { updateBestImageWebViewRenderingState, updateBestImageWebViewState, type BestImageWebViewState } from './best-image-webview-state';

export function useBestImagePreview(width: number, messageScale: number | undefined, guard: boolean | undefined) {
  const [pageHeights, setPageHeights] = useState<Record<string, number>>({});
  const [pageIndex, setPageIndex] = useState(0);
  const [previewStates, setPreviewStates] = useState<Record<string, BestImageWebViewState>>({});
  const handlePreviewMessage = (data: string, pageId: string) => {
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
