

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
    previewDifficulty: config.previewDifficulty,
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




export function applyPhigrosChartPreviewConfigToHtml(html: string, config: PhigrosChartPreviewConfig): string {
  return phigrosChartPreviewInjectors.applyConfigToHtml(html, config);
}
