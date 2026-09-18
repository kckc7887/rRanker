import { describe, expect, it } from 'vitest';
import {
  CHART_PREVIEW_PREPARE_END,
  chartPreviewDownloadFraction,
  chartPreviewPrepareProgress,
  chartPreviewWebViewProgress,
  clampChartPreviewProgress,
  createChartPreviewProgressReporter,
  mapChartPreviewProgress,
  mergeChartPreviewProgress,
  sequentialChartPreviewProgress,
  weightedChartPreviewProgress,
} from '@/features/chart-preview-shared/chart-preview-progress';

describe('chart preview progress helpers', () => {
  it('clamps non-finite and out-of-range values', () => {
    expect(clampChartPreviewProgress(Number.NaN)).toBe(0);
    expect(clampChartPreviewProgress(-1)).toBe(0);
    expect(clampChartPreviewProgress(2)).toBe(1);
  });

  it('maps prepare into the reserved native range and webview into the remainder', () => {
    expect(chartPreviewPrepareProgress({ label: '正在加载资源…', value: 1 }).value).toBe(CHART_PREVIEW_PREPARE_END);
    expect(chartPreviewWebViewProgress({ label: '正在加载谱面…', value: 0 }).value).toBe(CHART_PREVIEW_PREPARE_END);
    expect(chartPreviewWebViewProgress({ label: '正在加载谱面…', value: 1 }).value).toBe(1);
    expect(mapChartPreviewProgress(0.5, 0.7, 1)).toBeCloseTo(0.85);
  });

  it('merges progress monotonically and keeps the latest label', () => {
    const merged = mergeChartPreviewProgress(
      { label: '正在加载资源…', value: 0.4 },
      { label: '正在准备播放器…', value: 0.2 },
    );
    expect(merged).toEqual({ label: '正在准备播放器…', value: 0.4 });
  });

  it('weights concurrent files and sequential downloads', () => {
    expect(weightedChartPreviewProgress([
      { weight: 9, fraction: 1 },
      { weight: 1, fraction: 0 },
    ])).toBeCloseTo(0.9);
    expect(sequentialChartPreviewProgress(1, 0.5, 3)).toBeCloseTo(0.5);
    expect(chartPreviewDownloadFraction(50, 100)).toBe(0.5);
    expect(chartPreviewDownloadFraction(50, 0, 200)).toBe(0.25);
  });

  it('does not let a reporter go backwards', () => {
    const seen: number[] = [];
    const report = createChartPreviewProgressReporter((progress) => seen.push(progress.value));
    report('正在加载资源…', 0.4);
    report('正在加载资源…', 0.2);
    report('正在准备播放器…', 0.8);
    expect(seen).toEqual([0.4, 0.4, 0.8]);
  });
});
