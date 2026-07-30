import { describe, expect, it } from 'vitest';
import {
  buildChartPreviewInjectedJavaScript,
  chartPreviewStopScript,
} from '@/features/maimai-chart-preview/chart-preview-inject';

describe('chart preview webview helpers', () => {
  it('injects chart preview config before content loads', () => {
    const script = buildChartPreviewInjectedJavaScript({
      chartId: 10834,
      difficulty: 5,
      title: '测试曲 DX MASTER',
    });
    expect(script).toContain('window.__CHART_PREVIEW__=');
    expect(script).toContain('"chartId":10834');
    expect(script).toContain('"difficulty":5');
    expect(script).toContain('true;');
  });

  it('builds a stop script for leaving the page', () => {
    expect(chartPreviewStopScript()).toContain("type:'stop'");
  });
});
