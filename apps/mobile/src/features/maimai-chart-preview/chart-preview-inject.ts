import {
  parseChartPreviewBridgeMessage as parseChartPreviewBridgeMessageBase,
} from '@/features/chart-preview-shared/chart-preview-bridge';
import { createChartPreviewInjectors } from '@/features/chart-preview-shared/chart-preview-inject-factory';

import type { ChartPreviewSettings, ChartPreviewInjectConfig } from './configuration';
export type { ChartPreviewSettings, ChartPreviewInjectConfig, BuddyPreviewSide } from './configuration';

export type ChartPreviewBridgeMessage = ChartPreviewSettings & {
  type?: string;
  message?: string;
  active?: boolean;
};

export function parseChartPreviewBridgeMessage(raw: string): ChartPreviewBridgeMessage | null {
  return parseChartPreviewBridgeMessageBase(raw) as ChartPreviewBridgeMessage | null;
}

const chartPreviewInjectors = createChartPreviewInjectors<ChartPreviewInjectConfig>({
  globalVar: '__CHART_PREVIEW__',
  placeholder: '<!--CHART_PREVIEW_CONFIG-->',
  serialize: (config) => JSON.stringify({
    chartId: config.chartId,
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

export function buildChartPreviewConfigJson(config: ChartPreviewInjectConfig): string {
  return chartPreviewInjectors.buildConfigJson(config);
}

export function buildChartPreviewConfigScript(config: ChartPreviewInjectConfig): string {
  return chartPreviewInjectors.buildConfigScript(config);
}

export function buildChartPreviewInjectedJavaScript(config: ChartPreviewInjectConfig): string {
  return chartPreviewInjectors.buildInjectedJavaScript(config);
}

export {
  chartPreviewStopScript,
  chartPreviewExitFullscreenScript,
} from '@/features/chart-preview-shared/chart-preview-bridge';

/** 把配置脚本写入 HTML 模板（file:// 下比 injectedJavaScript 更可靠）。 */
export function applyChartPreviewConfigToHtml(html: string, config: ChartPreviewInjectConfig): string {
  return chartPreviewInjectors.applyConfigToHtml(html, config);
}
