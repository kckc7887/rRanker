/** 纯函数：供 RN 壳与单元测试共用，避免拉取 react-native。 */

import { createChartPreviewInjectors } from '@/features/chart-preview-shared/chart-preview-inject-factory';

import type { PgrPreviewConfig, PgrPreviewSettings, PgrPreviewRpeAssets } from '@/features/chart-preview-shared/pgr-preview-config';
export type PhigrosChartPreviewSettings = PgrPreviewSettings;
export type PhigrosChartPreviewRpeAssets = PgrPreviewRpeAssets;
export type PhigrosChartPreviewConfig = PgrPreviewConfig;

const phigrosChartPreviewInjectors = createChartPreviewInjectors<PhigrosChartPreviewConfig>({
  globalVar: '__PHIGROS_CHART_PREVIEW__',
  placeholder: '<!--PHIGROS_CHART_PREVIEW_CONFIG-->',
  serialize: (config) => JSON.stringify({
    game: config.game,
    sourceLabel: config.sourceLabel,
    title: config.title ?? '',
    chartUrl: config.chartUrl ?? null,
    chartText: config.chartText ?? null,
    musicUrl: config.musicUrl ?? null,
    illustrationUrl: config.illustrationUrl ?? null,
    hitSounds: config.hitSounds ?? null,
    settings: config.settings ?? null,
    format: config.format ?? 'pgr',
    rpeAssets: config.rpeAssets ?? null,
    theme: config.theme ?? 'dark',
  }),
});

export function buildPhigrosChartPreviewConfigJson(config: PhigrosChartPreviewConfig): string {
  return phigrosChartPreviewInjectors.buildConfigJson(config);
}

export function buildPhigrosChartPreviewConfigScript(config: PhigrosChartPreviewConfig): string {
  return phigrosChartPreviewInjectors.buildConfigScript(config);
}

export function buildPhigrosChartPreviewInjectedJavaScript(config: PhigrosChartPreviewConfig): string {
  return phigrosChartPreviewInjectors.buildInjectedJavaScript(config);
}

/** 把配置脚本写入 HTML 模板（file:// 下比 injectedJavaScript 更可靠）。 */
export function applyPhigrosChartPreviewConfigToHtml(html: string, config: PhigrosChartPreviewConfig): string {
  return phigrosChartPreviewInjectors.applyConfigToHtml(html, config);
}
