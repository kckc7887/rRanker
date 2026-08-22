/** 打开谱面页并检查导航是否生效。 */

import type { Href } from 'expo-router';
import {
  discardChartPreviewNavigation,
  stageChartPreviewNavigation,
  type ChartPreviewNavigationRequest,
} from './chart-preview-navigation';

export type ChartPreviewOpenDeps = {
  push: (href: Href) => void;
  /** 读取当前顶层路由名；跳转未生效时应仍为详情页路由。 */
  topRouteName: () => string | undefined;
  onFail: (message: string) => void;
};

/** 详情页路由名（app/songs/[songId].tsx 同时承载 Phigros 与 Phira 详情）。 */
export const CHART_PREVIEW_DETAIL_ROUTE = 'songs/[songId]';
/** 跳转后校验等待窗口：导航状态在 dispatch 时同步更新，窗口只需覆盖动画启动。 */
export const CHART_PREVIEW_NAVIGATION_CHECK_DELAY_MS = 600;

/**
 * 打开谱面确认。返回取消函数（组件卸载时调用，避免残留定时器误报）。
 */
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
    // 路由仍停留在详情页时视为跳转失败。
    if (deps.topRouteName() === CHART_PREVIEW_DETAIL_ROUTE) {
      deps.onFail('页面跳转未生效，请重试');
    }
  }, CHART_PREVIEW_NAVIGATION_CHECK_DELAY_MS);
  return () => clearTimeout(timer);
}
