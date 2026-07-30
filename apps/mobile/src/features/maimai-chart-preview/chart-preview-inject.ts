/** 纯函数：供 RN 壳与单元测试共用，避免拉取 react-native。 */

export function buildChartPreviewInjectedJavaScript(config: {
  chartId: number;
  difficulty: number;
  title?: string;
}): string {
  const payload = JSON.stringify({
    chartId: config.chartId,
    difficulty: config.difficulty,
    title: config.title ?? '',
  });
  return `window.__CHART_PREVIEW__=${payload};true;`;
}

export function chartPreviewStopScript(): string {
  return `window.postMessage({type:'stop'}, '*');true;`;
}
