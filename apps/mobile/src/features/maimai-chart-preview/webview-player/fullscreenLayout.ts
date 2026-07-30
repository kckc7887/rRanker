export type ChartPreviewCanvasSizeInput = {
  isFullscreen: boolean;
  containerWidth: number;
  viewportWidth: number;
  viewportHeight: number;
};

export function chartPreviewCanvasSize({
  isFullscreen,
  containerWidth,
  viewportWidth,
  viewportHeight,
}: ChartPreviewCanvasSizeInput): number {
  const width = isFullscreen ? viewportWidth : containerWidth;
  return Math.max(0, Math.floor(Math.min(width, viewportHeight)));
}
