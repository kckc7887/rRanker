/** 纯函数：供 RN 壳与单元测试共用，避免拉取 react-native。 */

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
    format: config.format ?? 'pgr',
    rpeAssets: config.rpeAssets ?? null,
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
