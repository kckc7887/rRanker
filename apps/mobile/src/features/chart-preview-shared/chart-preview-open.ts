import type { Href } from 'expo-router';
import {
  discardChartPreviewNavigation,
  stageChartPreviewNavigation,
  type ChartPreviewNavigationRequest,
} from './chart-preview-navigation';

export type ChartPreviewOpenDeps = {
  push: (href: Href) => void;

  topRouteName: () => string | undefined;
  onFail: (message: string) => void;
};

export const CHART_PREVIEW_DETAIL_ROUTE = 'songs/[songId]';

export const CHART_PREVIEW_NAVIGATION_CHECK_DELAY_MS = 600;

export function openChartPreviewNavigation(
  request: ChartPreviewNavigationRequest,
  deps: ChartPreviewOpenDeps,
): () => void {
  let href: ReturnType<typeof stageChartPreviewNavigation> | null = null;
  try {
    href = stageChartPreviewNavigation(request);
    deps.push(href as Href);
  } catch {
    if (href) discardChartPreviewNavigation(href.params.requestId);
    deps.onFail('无法打开谱面，请重试。');
    return () => undefined;
  }

  const timer = setTimeout(() => {

    if (deps.topRouteName() === CHART_PREVIEW_DETAIL_ROUTE) {
      deps.onFail('页面跳转未生效，请重试');
    }
  }, CHART_PREVIEW_NAVIGATION_CHECK_DELAY_MS);
  return () => clearTimeout(timer);
}
