import { Directory } from 'expo-file-system';
import { Platform } from 'react-native';
import { prepareChartPreviewWebviewFromPlan } from '@/features/chart-preview-shared/prepare-chart-preview-webview-from-plan';
import { chartPreviewStageDirectory as chartPreviewStageDirectoryBase } from '@/features/chart-preview-shared/chart-preview-assets';
import {
  applyChartPreviewConfigToHtml,
  type ChartPreviewInjectConfig,
} from './chart-preview-inject';
import { MAIMAI_CHART_PREVIEW_ANSWER_SOUND } from './maimai-chart-preview-skin-manifest.generated';
import {
  maimaiChartPreviewRuntimeSkinAssets,
  maimaiChartPreviewSkinStagePath,
} from './maimai-chart-preview-skin-files';

export {
  applyChartPreviewConfigToHtml,
  buildChartPreviewConfigScript,
  buildChartPreviewInjectedJavaScript,
  chartPreviewExitFullscreenScript,
  chartPreviewStopScript,
  parseChartPreviewBridgeMessage,
  type ChartPreviewInjectConfig,
} from './chart-preview-inject';
export {
  loadAssetFileUri,
  readAssetText,
  stageAsset,
} from '@/features/chart-preview-shared/chart-preview-assets';

// Metro 在运行时解析这些静态资源模块。
const HTML_MODULE = require('../../../assets/maimai-chart-preview/index.html') as number;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PLAYER_MODULE = require('../../../assets/maimai-chart-preview/player.bundle') as number;

export type ChartPreviewWebViewSource = {
  uri: string;
  allowingReadAccessToURL: string;
  dispose: () => void;
};

export function chartPreviewStageDirectory(name = 'rranker-chart-preview'): Directory {
  return chartPreviewStageDirectoryBase(name);
}

/** 将播放器脚本、远程皮肤与正解音写入同一目录，保证 file URL 可以互相访问。 */
export async function prepareChartPreviewWebViewSource(
  config: ChartPreviewInjectConfig,
): Promise<ChartPreviewWebViewSource> {
  return prepareChartPreviewWebviewFromPlan({
    directoryName: 'rranker-chart-preview',
    remoteCacheDirectory: chartPreviewStageDirectoryBase('rranker-chart-preview-remote'),
    stagedAssets: [
      { fileName: 'player.js', moduleId: PLAYER_MODULE },
      ...maimaiChartPreviewRuntimeSkinAssets().map(({ path, url, bytes }) => ({
        fileName: maimaiChartPreviewSkinStagePath(path),
        url,
        bytes,
      })),
    ],
    dataUrlAssets: [
      {
        key: 'answerSoundUrl',
        fileName: MAIMAI_CHART_PREVIEW_ANSWER_SOUND.path,
        url: MAIMAI_CHART_PREVIEW_ANSWER_SOUND.url,
        bytes: MAIMAI_CHART_PREVIEW_ANSWER_SOUND.bytes,
      },
    ],
    htmlModuleId: HTML_MODULE,
    buildHtml: (template, dataUrls) => applyChartPreviewConfigToHtml(template, {
      ...config,
      answerSoundUrl: dataUrls.answerSoundUrl,
    }),
  });
}

export function chartPreviewAllowsFileAccess(): boolean {
  return Platform.OS === 'android' || Platform.OS === 'ios';
}
