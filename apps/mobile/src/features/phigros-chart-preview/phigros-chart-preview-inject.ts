/** 纯函数：供 RN 壳与单元测试共用，避免拉取 react-native。 */

import { createChartPreviewInjectors } from '@/features/chart-preview-shared/chart-preview-inject-factory';

export type PhigrosChartPreviewSettings = {
  playbackSpeed?: number;
  noteScale?: number;
  volume?: number;
  backgroundDim?: number;
  multiHint?: boolean;
  lineColor?: string;
  hitSoundVolume?: number;
  aspectRatio?: number | null;
  flipX?: boolean;
  effects?: boolean;
};

export type PhigrosChartPreviewRpeAssets = {
  /** 相对播放器 HTML 的谱面包资源目录（判定线贴图/背景/gif/视频），以 / 结尾。 */
  basePath: string;
  extraJson: string | null;
  infoYml: string | null;
  shaders: Record<string, string>;
};

export type PhigrosChartPreviewConfig = {
  game: 'phigros' | 'phira';
  title?: string;
  chartUrl?: string;
  chartText?: string;
  musicUrl?: string;
  illustrationUrl?: string;
  hitSounds?: { click?: string; drag?: string; flick?: string };
  settings?: PhigrosChartPreviewSettings;
  /** 谱面格式：pgr（默认）或 rpe；RPE 时提供 rpeAssets。 */
  format?: 'pgr' | 'rpe';
  rpeAssets?: PhigrosChartPreviewRpeAssets | null;
};

const phigrosChartPreviewInjectors = createChartPreviewInjectors<PhigrosChartPreviewConfig>({
  globalVar: '__PHIGROS_CHART_PREVIEW__',
  placeholder: '<!--PHIGROS_CHART_PREVIEW_CONFIG-->',
  serialize: (config) => JSON.stringify({
    game: config.game,
    title: config.title ?? '',
    chartUrl: config.chartUrl ?? null,
    chartText: config.chartText ?? null,
    musicUrl: config.musicUrl ?? null,
    illustrationUrl: config.illustrationUrl ?? null,
    hitSounds: config.hitSounds ?? null,
    settings: config.settings ?? null,
    format: config.format ?? 'pgr',
    rpeAssets: config.rpeAssets ?? null,
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
