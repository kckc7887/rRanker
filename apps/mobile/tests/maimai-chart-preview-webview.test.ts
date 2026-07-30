import { describe, expect, it } from 'vitest';
import {
  applyChartPreviewConfigToHtml,
  buildChartPreviewInjectedJavaScript,
  chartPreviewExitFullscreenScript,
  chartPreviewStopScript,
  parseChartPreviewBridgeMessage,
} from '@/features/maimai-chart-preview/chart-preview-inject';
import { chartPreviewCanvasSize } from '@/features/maimai-chart-preview/webview-player/fullscreenLayout';

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

  it('writes config into html template marker for file:// loading', () => {
    const html = applyChartPreviewConfigToHtml(
      '<html><!--CHART_PREVIEW_CONFIG--><script src="./player.js"></script></html>',
      { chartId: 834, difficulty: 4, title: 'SD' },
    );
    expect(html).toContain('window.__CHART_PREVIEW__=');
    expect(html).toContain('"chartId":834');
    expect(html).not.toContain('<!--CHART_PREVIEW_CONFIG-->');
  });

  it('builds a stop script for leaving the page', () => {
    expect(chartPreviewStopScript()).toContain("type:'stop'");
  });

  it('builds a fullscreen-exit script for native back handling', () => {
    expect(chartPreviewExitFullscreenScript()).toContain("type:'exit-fullscreen'");
  });

  it('parses native bridge messages and rejects non-object payloads', () => {
    expect(parseChartPreviewBridgeMessage('{"type":"fullscreen","active":true}')).toEqual({
      type: 'fullscreen',
      active: true,
    });
    expect(parseChartPreviewBridgeMessage('"fullscreen"')).toBeNull();
    expect(parseChartPreviewBridgeMessage('{')).toBeNull();
  });

  it('caps the canvas to the short viewport edge in and after fullscreen', () => {
    expect(chartPreviewCanvasSize({
      isFullscreen: true,
      containerWidth: 844,
      viewportWidth: 844,
      viewportHeight: 390,
    })).toBe(390);
    expect(chartPreviewCanvasSize({
      isFullscreen: false,
      containerWidth: 844,
      viewportWidth: 844,
      viewportHeight: 390,
    })).toBe(390);
    expect(chartPreviewCanvasSize({
      isFullscreen: false,
      containerWidth: 390,
      viewportWidth: 390,
      viewportHeight: 844,
    })).toBe(390);
  });
});
