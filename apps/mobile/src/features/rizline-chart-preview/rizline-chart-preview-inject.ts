import { createChartPreviewInjectors } from '@/features/chart-preview-shared/chart-preview-inject-factory';
import type { RizlineChartPreviewConfig } from './configuration';

const injectors = createChartPreviewInjectors<RizlineChartPreviewConfig>({
  globalVar: '__RIZLINE_CHART_PREVIEW_CONFIG__',
  placeholder: '<!--RIZLINE_CHART_PREVIEW_CONFIG-->',
  serialize: (config) => JSON.stringify({
    theme: config.theme,
    title: config.title ?? '',
    settings: config.settings,
  }),
});

export const applyRizlineChartPreviewConfigToHtml = injectors.applyConfigToHtml;
