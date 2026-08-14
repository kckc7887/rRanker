/** 纯函数：供 RN 壳与单元测试共用，避免拉取 react-native。 */

export type PhigrosChartPreviewSettings = {
  playbackSpeed?: number;
  noteScale?: number;
  volume?: number;
  backgroundDim?: number;
  multiHint?: boolean;
  lineColor?: string;
  hitSoundVolume?: number;
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
};

export function buildPhigrosChartPreviewConfigJson(config: PhigrosChartPreviewConfig): string {
  return JSON.stringify({
    game: config.game,
    title: config.title ?? '',
    chartUrl: config.chartUrl ?? null,
    chartText: config.chartText ?? null,
    musicUrl: config.musicUrl ?? null,
    illustrationUrl: config.illustrationUrl ?? null,
    hitSounds: config.hitSounds ?? null,
    settings: config.settings ?? null,
  });
}

export function buildPhigrosChartPreviewConfigScript(config: PhigrosChartPreviewConfig): string {
  return `<script>window.__PHIGROS_CHART_PREVIEW__=${buildPhigrosChartPreviewConfigJson(config)};</script>`;
}

export function buildPhigrosChartPreviewInjectedJavaScript(config: PhigrosChartPreviewConfig): string {
  return `window.__PHIGROS_CHART_PREVIEW__={...(window.__PHIGROS_CHART_PREVIEW__||{}),...${buildPhigrosChartPreviewConfigJson(config)}};true;`;
}

/** 把配置脚本写入 HTML 模板（file:// 下比 injectedJavaScript 更可靠）。 */
export function applyPhigrosChartPreviewConfigToHtml(html: string, config: PhigrosChartPreviewConfig): string {
  const script = buildPhigrosChartPreviewConfigScript(config);
  if (html.includes('<!--PHIGROS_CHART_PREVIEW_CONFIG-->')) {
    return html.replace('<!--PHIGROS_CHART_PREVIEW_CONFIG-->', script);
  }
  return script + html;
}
