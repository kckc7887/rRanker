export type ChartPreviewCanvasSizeInput = {
  isFullscreen: boolean;
  containerWidth: number;
  viewportWidth: number;
  viewportHeight: number;
  /** 同屏画布数量：1=单谱面，2=Buddy 1P+2P 并排。 */
  chartCount?: 1 | 2;
};

/** Buddy 同屏时两个画布之间的间距（逻辑像素）。 */
export const CHART_PREVIEW_DUAL_GAP = 8;

export function chartPreviewCanvasSize({
  isFullscreen,
  containerWidth,
  viewportWidth,
  viewportHeight,
  chartCount = 1,
}: ChartPreviewCanvasSizeInput): number {
  const width = isFullscreen ? viewportWidth : containerWidth;
  const available = Math.max(0, width - CHART_PREVIEW_DUAL_GAP * (chartCount - 1));
  return Math.max(0, Math.floor(Math.min(available / chartCount, viewportHeight)));
}
