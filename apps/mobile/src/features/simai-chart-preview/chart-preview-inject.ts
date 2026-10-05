import { createChartPreviewInjectors } from '@/features/chart-preview-shared/chart-preview-inject-factory';

import type { ChartPreviewInjectConfig } from './configuration';
export type { ChartPreviewSettings, ChartPreviewInjectConfig, BuddyPreviewSide } from './configuration';

const chartPreviewInjectors = createChartPreviewInjectors<ChartPreviewInjectConfig>({
  globalVar: '__CHART_PREVIEW__',
  placeholder: '<!--CHART_PREVIEW_CONFIG-->',
  serialize: (config) => JSON.stringify({
    chartId: config.chartId,
    chartUrl: config.chartUrl,
    musicUrl: config.musicUrl,
    simaiText: config.simaiText,
    parsedChart: config.parsedChart,
    difficulty: config.difficulty,
    title: config.title ?? '',
    settings: config.settings ?? null,
    answerSoundUrl: config.answerSoundUrl,
    backgroundImageUrl: config.backgroundImageUrl,
    backgroundVideoUrl: config.backgroundVideoUrl,
    buddySide: config.buddySide ?? null,
    theme: config.theme ?? 'dark',
  }),
});



export function buildChartPreviewInjectedJavaScript(config: ChartPreviewInjectConfig): string {
  return chartPreviewInjectors.buildInjectedJavaScript(config);
}

/** 把配置脚本写入 HTML 模板（file:// 下比 injectedJavaScript 更可靠）。 */
export function applyChartPreviewConfigToHtml(html: string, config: ChartPreviewInjectConfig): string {
  return chartPreviewInjectors.applyConfigToHtml(html, config);
}
