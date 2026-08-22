/**
 * 舞萌谱面确认 WebView prepare（兼容层）：
 * stage 目录/资产解析四件与 asset URI 解析已下沉到 chart-preview-shared 公共层，
 * 本文件保留舞萌 stage 目录名默认值与全部原导出名/签名，调用方零改动；
 * 舞萌专属的资产清单声明与 file 访问开关保留原地。
 */

import { Directory } from 'expo-file-system';
import { Platform } from 'react-native';
import { prepareChartPreviewWebviewFromPlan } from '@/features/chart-preview-shared/prepare-chart-preview-webview-from-plan';
import { chartPreviewStageDirectory as chartPreviewStageDirectoryBase } from '@/features/chart-preview-shared/chart-preview-assets';
import {
  applyChartPreviewConfigToHtml,
  type ChartPreviewInjectConfig,
} from './chart-preview-inject';

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

// Metro 静态资源模块编号只能在运行时 require 取得（模块级常量），
// 改写为 import 需补齐 .html/.bundle/.webp/.wav 的模块声明且无行为收益。
 
const HTML_MODULE = require('../../../assets/maimai-chart-preview/index.html') as number;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PLAYER_MODULE = require('../../../assets/maimai-chart-preview/player.bundle') as number;
const SENSOR_MODULE = require('../../../assets/maimai-chart-preview/sensor.webp') as number;
const ANSWER_MODULE = require('../../../assets/maimai-chart-preview/answer.wav') as number;

export type ChartPreviewWebViewSource = {
  uri: string;
  allowingReadAccessToURL: string;
  dispose: () => void;
};

export function chartPreviewStageDirectory(name = 'rranker-chart-preview'): Directory {
  return chartPreviewStageDirectoryBase(name);
}

/**
 * 将 HTML / player.js / sensor / answer 落到缓存目录，并在 HTML 内写入谱面参数。
 * file:// WebView 上比依赖 injectedJavaScriptBeforeContentLoaded 更稳。
 */
export async function prepareChartPreviewWebViewSource(
  config: ChartPreviewInjectConfig,
): Promise<ChartPreviewWebViewSource> {
  return prepareChartPreviewWebviewFromPlan({
    directoryName: 'rranker-chart-preview',
    stagedAssets: [
      { fileName: 'player.js', moduleId: PLAYER_MODULE },
      { fileName: 'sensor.webp', moduleId: SENSOR_MODULE },
      { fileName: 'answer.wav', moduleId: ANSWER_MODULE },
    ],
    dataUrlAssets: [
      { key: 'answerSoundUrl', moduleId: ANSWER_MODULE, fileName: 'answer.wav' },
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
