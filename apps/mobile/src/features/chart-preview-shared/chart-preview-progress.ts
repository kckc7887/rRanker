/**
 * 谱面确认加载进度（公共路径）：
 * 0～1 的单调进度与阶段文案。壳、计划执行器与游戏 prepare 共用，不识别游戏。
 */

export type ChartPreviewLoadProgress = {
  label: string;
  value: number;
};

export const CHART_PREVIEW_RESOURCE_LABEL = '正在加载资源…';
export const CHART_PREVIEW_PLAYER_LABEL = '正在准备播放器…';
/** native prepare 映射到进度条的上限；其余留给播放器就绪。 */
export const CHART_PREVIEW_PREPARE_END = 0.9;

export function clampChartPreviewProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function mapChartPreviewProgress(value: number, start: number, end: number): number {
  return start + clampChartPreviewProgress(value) * (end - start);
}

export function chartPreviewPrepareProgress(progress: ChartPreviewLoadProgress): ChartPreviewLoadProgress {
  return {
    label: progress.label,
    value: mapChartPreviewProgress(progress.value, 0, CHART_PREVIEW_PREPARE_END),
  };
}

export function chartPreviewWebViewProgress(progress: ChartPreviewLoadProgress): ChartPreviewLoadProgress {
  return {
    label: progress.label,
    value: mapChartPreviewProgress(progress.value, CHART_PREVIEW_PREPARE_END, 1),
  };
}

export function mergeChartPreviewProgress(
  current: ChartPreviewLoadProgress | null | undefined,
  next: ChartPreviewLoadProgress,
): ChartPreviewLoadProgress {
  return {
    label: next.label || current?.label || CHART_PREVIEW_PLAYER_LABEL,
    value: Math.max(current?.value ?? 0, clampChartPreviewProgress(next.value)),
  };
}

export function chartPreviewDownloadFraction(written: number, expected: number, knownSize = 0): number {
  const total = expected > 0 ? expected : knownSize;
  if (total > 0) return Math.min(1, Math.max(0, written / total));
  return 0;
}

export function weightedChartPreviewProgress(parts: readonly { weight: number; fraction: number }[]): number {
  const total = parts.reduce((sum, part) => sum + Math.max(0, part.weight), 0);
  if (total <= 0) return 1;
  return parts.reduce(
    (sum, part) => sum + Math.max(0, part.weight) * clampChartPreviewProgress(part.fraction),
    0,
  ) / total;
}

export function sequentialChartPreviewProgress(index: number, fileFraction: number, count: number): number {
  if (count <= 0) return 1;
  return (index + clampChartPreviewProgress(fileFraction)) / count;
}

export function createChartPreviewProgressReporter(
  onProgress: ((progress: ChartPreviewLoadProgress) => void) | undefined,
) {
  let last = 0;
  return (label: string, value: number) => {
    const next = Math.max(last, clampChartPreviewProgress(value));
    last = next;
    onProgress?.({ label, value: next });
  };
}
