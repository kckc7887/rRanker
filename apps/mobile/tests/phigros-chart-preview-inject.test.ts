import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { applyPhigrosChartPreviewConfigToHtml } from '@/features/phigros-chart-preview/phigros-chart-preview-inject';
import type { PhigrosChartPreviewConfig } from '@/features/phigros-chart-preview/phigros-chart-preview-inject';

function injected(config: PhigrosChartPreviewConfig) {
  const dom = new JSDOM(applyPhigrosChartPreviewConfigToHtml('<html><body><!--PHIGROS_CHART_PREVIEW_CONFIG--></body></html>', config), { runScripts: 'dangerously' });
  const value = (dom.window as unknown as { __PHIGROS_CHART_PREVIEW__: PhigrosChartPreviewConfig }).__PHIGROS_CHART_PREVIEW__;
  dom.window.close();
  return value;
}

describe('Phigros chart preview config injection', () => {
  it('provides current chart resources and settings to the player', () => {
    expect(injected({ game: 'phigros', title: 'Distorted Fate AT', chartUrl: 'https://assets.example/AT.json', musicUrl: 'https://assets.example/song.ogg', settings: { playbackSpeed: 1.5, lineColor: 'gold' } }))
      .toMatchObject({ game: 'phigros', title: 'Distorted Fate AT', chartUrl: 'https://assets.example/AT.json', musicUrl: 'https://assets.example/song.ogg', settings: { playbackSpeed: 1.5, lineColor: 'gold' }, theme: 'dark' });
  });
  it('provides inline RPE resources and the chosen theme', () => {
    const rpeAssets = { basePath: './rpe/38294/', extraJson: '{"effects":[]}', infoYml: 'name: Test', shaders: { 'camera_pr.glsl': 'void main(){}' } };
    expect(injected({ game: 'phira', chartText: '{"META":{}}', format: 'rpe', rpeAssets, theme: 'light' }))
      .toMatchObject({ game: 'phira', chartText: '{"META":{}}', format: 'rpe', rpeAssets, theme: 'light' });
  });
  it('preserves chart text without executing embedded HTML', () => {
    const chartText = '</script><script>throw new Error("executed")</script>$$';
    expect(injected({ game: 'phira', chartText }).chartText).toBe(chartText);
  });
});
