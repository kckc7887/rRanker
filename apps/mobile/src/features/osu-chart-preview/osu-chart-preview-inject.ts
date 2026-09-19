import { createChartPreviewInjectors } from '@/features/chart-preview-shared/chart-preview-inject-factory';
import type { OsuChartPreviewConfig } from './configuration';

const injectors = createChartPreviewInjectors<OsuChartPreviewConfig>({
  globalVar: '__OSU_CHART_PREVIEW_CONFIG__',
  placeholder: '<!--OSU_CHART_PREVIEW_CONFIG-->',
  serialize: (config) => JSON.stringify(config),
});

export const buildOsuChartPreviewConfigJson = injectors.buildConfigJson;
export const applyOsuChartPreviewConfigToHtml = injectors.applyConfigToHtml;

export function buildOsuChartPreviewAudioScript(audio: Record<string, string>): string {
  return `window.__OSU_PREVIEW_AUDIO__=${JSON.stringify(audio)
    .replace(/</gu, '\\u003c').replace(/\u2028/gu, '\\u2028').replace(/\u2029/gu, '\\u2029')};`;
}
