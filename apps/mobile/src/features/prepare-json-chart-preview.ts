import { File, type Directory } from 'expo-file-system';
import type { PreparedPgrPreviewInput } from './chart-preview-shared/pgr-preview-config';
import type { ChartPreviewLoadProgress } from './chart-preview-shared/chart-preview-progress';
import { prepareChartPreviewWebviewFromPlan } from './chart-preview-shared/prepare-chart-preview-webview-from-plan';
import { preparePhigrosChartPreviewWebViewSource } from './phigros-chart-preview/prepare-phigros-chart-preview-webview';
import { normalizeRizlineChartPreviewSettings } from './rizline-chart-preview/configuration';
import { applyRizlineChartPreviewConfigToHtml } from './rizline-chart-preview/rizline-chart-preview-inject';

export async function prepareJsonChartPreview(config: PreparedPgrPreviewInput['config'], music: string | null, directory: Directory,
  signal: AbortSignal, progress?: (value: ChartPreviewLoadProgress) => void) {
  if (config.format !== 'rizline') {
    const source = await preparePhigrosChartPreviewWebViewSource(config, music, directory, signal, progress);
    return { ...source, fullscreenOrientation: 'landscape' as const };
  }
  const source = await prepareChartPreviewWebviewFromPlan({
    directoryName: directory.name, directory,
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    stagedAssets: [{ fileName: 'player.js', moduleId: require('../../assets/rizline-chart-preview/player.bundle') as number }],
    htmlModuleId: require('../../assets/rizline-chart-preview/index.html') as number,
    writers: [async root => {
      const chartFile = new File(root, 'chart-data.js');
      chartFile.create({ overwrite: true });
      chartFile.write(`window.__RIZLINE_CHART_PREVIEW_CHART__=${config.chartText};`);
      const musicFile = new File(root, 'music-data.js');
      musicFile.create({ overwrite: true });
      musicFile.write(`window.__RIZLINE_CHART_PREVIEW_MUSIC__=${JSON.stringify(music)};`);
    }],
    buildHtml: template => applyRizlineChartPreviewConfigToHtml(template, {
      theme: config.theme ?? 'dark', title: config.title, previewDifficulty: config.previewDifficulty,
      settings: normalizeRizlineChartPreviewSettings(config.settings),
    }),
  }, signal, progress);
  return { ...source, fullscreenOrientation: 'portrait_up' as const };
}
