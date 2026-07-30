/** 纯函数：供 RN 壳与单元测试共用，避免拉取 react-native。 */

export type ChartPreviewInjectConfig = {
  chartId: number;
  difficulty: number;
  title?: string;
};

export function buildChartPreviewConfigJson(config: ChartPreviewInjectConfig): string {
  return JSON.stringify({
    chartId: config.chartId,
    difficulty: config.difficulty,
    title: config.title ?? '',
  });
}

export function buildChartPreviewConfigScript(config: ChartPreviewInjectConfig): string {
  return `<script>window.__CHART_PREVIEW__=${buildChartPreviewConfigJson(config)};</script>`;
}

export function buildChartPreviewInjectedJavaScript(config: ChartPreviewInjectConfig): string {
  return `window.__CHART_PREVIEW__=${buildChartPreviewConfigJson(config)};true;`;
}

export function chartPreviewStopScript(): string {
  return `window.postMessage({type:'stop'}, '*');true;`;
}

/** 把配置脚本写入 HTML 模板（file:// 下比 injectedJavaScript 更可靠）。 */
export function applyChartPreviewConfigToHtml(html: string, config: ChartPreviewInjectConfig): string {
  const script = buildChartPreviewConfigScript(config);
  if (html.includes('<!--CHART_PREVIEW_CONFIG-->')) {
    return html.replace('<!--CHART_PREVIEW_CONFIG-->', script);
  }
  return script + html;
}
