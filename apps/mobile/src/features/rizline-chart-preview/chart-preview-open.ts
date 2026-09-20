/** 打开 Rizline 谱面确认页并检查导航是否生效。 */

import type { Href } from 'expo-router';
import type { RizlineChartPreviewTarget } from './configuration';

export type RizlineChartPreviewOpenDeps = {
  push: (href: Href) => void;
  topRouteName: () => string | undefined;
  onFail: (message: string) => void;
};

export const RIZLINE_CHART_PREVIEW_DETAIL_ROUTE = 'songs/[songId]';
export const RIZLINE_CHART_PREVIEW_NAVIGATION_CHECK_DELAY_MS = 600;

export function openRizlineChartPreview(
  target: RizlineChartPreviewTarget,
  deps: RizlineChartPreviewOpenDeps,
): () => void {
  try {
    deps.push({
      pathname: '/songs/rizline-chart-preview',
      params: {
        songId: target.songId,
        levelIndex: String(target.levelIndex),
        ...(target.title ? { title: target.title } : {}),
      },
    } as Href);
  } catch {
    deps.onFail('无法打开谱面，请重试。');
    return () => undefined;
  }
  const timer = setTimeout(() => {
    if (deps.topRouteName() === RIZLINE_CHART_PREVIEW_DETAIL_ROUTE) {
      deps.onFail('页面跳转未生效，请重试');
    }
  }, RIZLINE_CHART_PREVIEW_NAVIGATION_CHECK_DELAY_MS);
  return () => clearTimeout(timer);
}
