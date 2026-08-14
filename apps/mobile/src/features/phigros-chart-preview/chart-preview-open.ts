/**
 * 详情页“查看谱面确认”统一入口（公共路径）：
 * 交接请求 → 跳转 → 兜底提示。expo-router 对无法生成导航状态的 href
 * 会静默丢弃（不抛错也不跳转，表现为“点击无反应”），这里在短暂等待后
 * 校验顶层路由是否真的离开详情页，未离开则显式提示失败。
 *
 * 本模块保持纯函数（仅类型依赖 expo-router），跳转与路由读取由调用方注入，
 * 便于在 node 环境用假定时器验证全部失败分支。
 */

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
  } catch (error) {
    if (href) discardChartPreviewNavigation(href.params.requestId);
    deps.onFail(error instanceof Error ? error.message : '谱面确认请求传递失败，请重试');
    return () => undefined;
  }

  const timer = setTimeout(() => {
    // 跳转成功后顶层路由是谱面确认页；仍停留在详情页说明跳转被静默丢弃。
    if (deps.topRouteName() === CHART_PREVIEW_DETAIL_ROUTE) {
      deps.onFail('页面跳转未生效，请重试');
    }
  }, CHART_PREVIEW_NAVIGATION_CHECK_DELAY_MS);
  return () => clearTimeout(timer);
}
