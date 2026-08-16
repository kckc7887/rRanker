import { describe, expect, it } from 'vitest';
import {
  applyPhigrosChartPreviewConfigToHtml,
  buildPhigrosChartPreviewConfigJson,
  buildPhigrosChartPreviewConfigScript,
  buildPhigrosChartPreviewInjectedJavaScript,
} from '@/features/phigros-chart-preview/phigros-chart-preview-inject';
import { parseChartPreviewBridgeMessage } from '@/features/maimai-chart-preview/chart-preview-inject';

describe('phigros chart preview config injection', () => {
  const config = {
    game: 'phigros' as const,
    title: 'Distorted Fate AT',
    chartUrl: 'https://assets.example/charts/AT.json',
    musicUrl: 'https://assets.example/music/song.ogg',
    illustrationUrl: 'https://assets.example/illustrations/song.png',
    settings: { playbackSpeed: 1.5, lineColor: 'gold' },
  };

  it('配置 JSON 只包含约定字段且 null 缺省明确', () => {
    const parsed = JSON.parse(buildPhigrosChartPreviewConfigJson({ game: 'phira', title: '测试' }));
    expect(parsed).toEqual({
      game: 'phira',
      title: '测试',
      chartUrl: null,
      chartText: null,
      musicUrl: null,
      illustrationUrl: null,
      hitSounds: null,
      settings: null,
      format: 'pgr',
      rpeAssets: null,
      theme: 'dark',
    });
  });

  it('RPE 配置序列化 format 与 rpeAssets 文本注入', () => {
    const parsed = JSON.parse(buildPhigrosChartPreviewConfigJson({
      game: 'phira',
      title: '测试 RPE',
      chartText: '{"META":{}}',
      format: 'rpe',
      rpeAssets: {
        basePath: './rpe/38294/',
        extraJson: '{"effects":[]}',
        infoYml: 'name: Test',
        shaders: { 'camera_pr.glsl': 'void main(){}' },
      },
    }));
    expect(parsed).toEqual({
      game: 'phira',
      title: '测试 RPE',
      chartUrl: null,
      chartText: '{"META":{}}',
      musicUrl: null,
      illustrationUrl: null,
      hitSounds: null,
      settings: null,
      format: 'rpe',
      rpeAssets: {
        basePath: './rpe/38294/',
        extraJson: '{"effects":[]}',
        infoYml: 'name: Test',
        shaders: { 'camera_pr.glsl': 'void main(){}' },
      },
      theme: 'dark',
    });
  });

  it('浅色主题随配置序列化进 WebView', () => {
    const parsed = JSON.parse(buildPhigrosChartPreviewConfigJson({
      game: 'phigros',
      theme: 'light',
    }));
    expect(parsed.theme).toBe('light');
  });

  it('把配置脚本写入 HTML 标记并保留注入脚本的合并语义', () => {
    const html = '<html><body><!--PHIGROS_CHART_PREVIEW_CONFIG--></body></html>';
    const applied = applyPhigrosChartPreviewConfigToHtml(html, config);
    expect(applied).toContain(buildPhigrosChartPreviewConfigScript(config));
    expect(applied).not.toContain('<!--PHIGROS_CHART_PREVIEW_CONFIG-->');
    expect(applied).toContain('window.__PHIGROS_CHART_PREVIEW__=');
  });

  it('模板缺少标记时前置配置脚本', () => {
    const applied = applyPhigrosChartPreviewConfigToHtml('<html></html>', config);
    expect(applied.startsWith('<script>window.__PHIGROS_CHART_PREVIEW__=')).toBe(true);
  });

  it('注入脚本保留既有配置的合并语义', () => {
    const script = buildPhigrosChartPreviewInjectedJavaScript(config);
    expect(script).toContain('window.__PHIGROS_CHART_PREVIEW__={...(window.__PHIGROS_CHART_PREVIEW__||{}),...');
    expect(script.endsWith(';true;')).toBe(true);
  });

  it('设置消息可以经公共 bridge 解析往返', () => {
    const payload = { type: 'settings', playbackSpeed: 2, noteScale: 0.8, lineColor: 'blue' };
    const parsed = parseChartPreviewBridgeMessage(JSON.stringify(payload));
    expect(parsed).toEqual(payload);
    const { type, ...settings } = parsed!;
    expect(type).toBe('settings');
    expect(settings).toEqual({ playbackSpeed: 2, noteScale: 0.8, lineColor: 'blue' });
  });
});
