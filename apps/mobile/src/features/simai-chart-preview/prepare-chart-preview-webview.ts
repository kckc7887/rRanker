import { Directory, File } from 'expo-file-system';
import { Platform } from 'react-native';
import { downloadChartResource } from '@/features/chart-download-shared/chart-download-shared';
import { prepareChartPreviewWebviewFromPlan } from '@/features/chart-preview-shared/prepare-chart-preview-webview-from-plan';
import {
  chartPreviewStageDirectory as chartPreviewStageDirectoryBase,
  createChartPreviewSessionDirectory,
  disposeChartPreviewSessionDirectory,
} from '@/features/chart-preview-shared/chart-preview-assets';
import {
  CHART_PREVIEW_PLAYER_LABEL,
  CHART_PREVIEW_RESOURCE_LABEL,
  chartPreviewDownloadFraction,
  mapChartPreviewProgress,
  sequentialChartPreviewProgress,
  type ChartPreviewLoadProgress,
} from '@/features/chart-preview-shared/chart-preview-progress';
import {
  applyChartPreviewConfigToHtml,
  type ChartPreviewInjectConfig,
} from './chart-preview-inject';
import { MAIMAI_CHART_PREVIEW_ANSWER_SOUND } from './maimai-chart-preview-skin-manifest.generated';
import {
  MAIMAI_CHART_PREVIEW_SKIN_DATA_FILE,
  maimaiChartPreviewRuntimeSkinAssets,
  maimaiChartPreviewSkinDataScript,
  maimaiChartPreviewSkinStagePath,
  MAIMAI_CHART_PREVIEW_SENSOR,
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
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro 静态资源编号只能在运行时 require
const PLAYER_MODULE = require('../../../assets/maimai-chart-preview/player.bundle') as number;
const SENSOR_MODULE = require('../../../assets/maimai-chart-preview/sensor.webp') as number;

export const MAIMAI_CHART_PREVIEW_MUSIC_DATA_FILE = 'music-data.js';
export const MAIMAI_CHART_PREVIEW_MUSIC_DATA_GLOBAL = '__CHART_PREVIEW_MUSIC_DATA__';

export type ChartPreviewWebViewSource = {
  uri: string;
  allowingReadAccessToURL: string;
  dispose: () => void;
};

export function chartPreviewStageDirectory(name = 'rranker-chart-preview'): Directory {
  return chartPreviewStageDirectoryBase(name);
}

function musicDataScript(base64: string | null): string {
  return `window.${MAIMAI_CHART_PREVIEW_MUSIC_DATA_GLOBAL}=${base64 ? JSON.stringify(base64) : 'null'};`;
}

async function downloadPreviewFile(
  directory: Directory,
  fileName: string,
  url: string,
  signal: AbortSignal,
  onFraction: (fraction: number) => void,
): Promise<File> {
  return downloadChartResource(
    directory,
    fileName,
    url,
    signal,
    ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
      onFraction(chartPreviewDownloadFraction(totalBytesWritten, totalBytesExpectedToWrite));
    },
  );
}

/** 将播放器脚本、远程皮肤与正解音写入同一 session；皮肤编码为 skin-data.js。 */
export async function prepareChartPreviewWebViewSource(
  config: ChartPreviewInjectConfig,
  signal?: AbortSignal,
  onProgress?: (progress: ChartPreviewLoadProgress) => void,
): Promise<ChartPreviewWebViewSource> {
  const directory = createChartPreviewSessionDirectory('rranker-chart-preview');
  const needChart = !config.parsedChart && config.simaiText === undefined && Boolean(config.chartUrl);
  const needMusic = Boolean(config.musicUrl);
  const resourceCount = Number(needChart) + Number(needMusic);
  const resourceEnd = resourceCount > 0 ? 0.4 : 0;
  const report = (label: string, value: number) => onProgress?.({ label, value });
  try {
    let simaiText = config.simaiText;
    if (needChart && config.chartUrl) {
      const file = await downloadPreviewFile(directory, 'preview-chart.maimai', config.chartUrl, signal ?? new AbortController().signal, (fraction) => {
        report(CHART_PREVIEW_RESOURCE_LABEL, mapChartPreviewProgress(
          sequentialChartPreviewProgress(0, fraction, resourceCount),
          0,
          resourceEnd,
        ));
      });
      simaiText = new TextDecoder('utf-8').decode(await file.bytes());
      report(CHART_PREVIEW_RESOURCE_LABEL, mapChartPreviewProgress(
        sequentialChartPreviewProgress(0, 1, resourceCount),
        0,
        resourceEnd,
      ));
    }
    let musicDataBase64: string | null = null;
    if (needMusic && config.musicUrl) {
      const musicIndex = needChart ? 1 : 0;
      try {
        const file = await downloadPreviewFile(directory, 'preview-music.bin', config.musicUrl, signal ?? new AbortController().signal, (fraction) => {
          report(CHART_PREVIEW_RESOURCE_LABEL, mapChartPreviewProgress(
            sequentialChartPreviewProgress(musicIndex, fraction, resourceCount),
            0,
            resourceEnd,
          ));
        });
        musicDataBase64 = await file.base64();
      } catch {
        musicDataBase64 = null;
      }
      report(CHART_PREVIEW_RESOURCE_LABEL, mapChartPreviewProgress(1, 0, resourceEnd));
    }
    if (signal?.aborted) throw signal.reason ?? new Error('操作已取消');
    report(CHART_PREVIEW_PLAYER_LABEL, resourceEnd);
    return await prepareChartPreviewWebviewFromPlan({
      directoryName: 'rranker-chart-preview',
      directory,
      remoteCacheDirectory: chartPreviewStageDirectoryBase('rranker-chart-preview-remote'),
      stagedAssets: [
        { fileName: 'player.js', moduleId: PLAYER_MODULE },
        { fileName: MAIMAI_CHART_PREVIEW_SENSOR.path, moduleId: SENSOR_MODULE },
        ...maimaiChartPreviewRuntimeSkinAssets().map(({ path, url, bytes }) => ({
          fileName: maimaiChartPreviewSkinStagePath(path),
          url,
          bytes,
        })),
      ],
      dataUrlAssets: [
        {
          key: 'answerSoundUrl',
          fileName: `${MAIMAI_CHART_PREVIEW_ANSWER_SOUND.sha256.slice(0, 16)}_${MAIMAI_CHART_PREVIEW_ANSWER_SOUND.path}`,
          url: MAIMAI_CHART_PREVIEW_ANSWER_SOUND.url,
          bytes: MAIMAI_CHART_PREVIEW_ANSWER_SOUND.bytes,
        },
      ],
      writers: [
        async (writerDirectory, writerSignal) => {
          const entries: Record<string, string> = {};
          const sensor = new File(writerDirectory, MAIMAI_CHART_PREVIEW_SENSOR.path);
          entries[MAIMAI_CHART_PREVIEW_SENSOR.path] = `data:image/webp;base64,${await sensor.base64()}`;
          for (const asset of maimaiChartPreviewRuntimeSkinAssets()) {
            if (writerSignal?.aborted) throw writerSignal.reason ?? new Error('操作已取消');
            const file = new File(writerDirectory, maimaiChartPreviewSkinStagePath(asset.path));
            if (!file.exists) throw new Error(`皮肤缺失：${asset.path}`);
            entries[asset.path] = `data:image/png;base64,${await file.base64()}`;
          }
          if (writerSignal?.aborted) throw writerSignal.reason ?? new Error('操作已取消');
          const output = new File(writerDirectory, MAIMAI_CHART_PREVIEW_SKIN_DATA_FILE);
          output.create({ overwrite: true });
          output.write(maimaiChartPreviewSkinDataScript(entries));
        },
        async (writerDirectory) => {
          const musicDataFile = new File(writerDirectory, MAIMAI_CHART_PREVIEW_MUSIC_DATA_FILE);
          musicDataFile.create({ overwrite: true });
          musicDataFile.write(musicDataScript(musicDataBase64));
        },
      ],
      htmlModuleId: HTML_MODULE,
      buildHtml: (template, dataUrls) => applyChartPreviewConfigToHtml(template, {
        ...config,
        simaiText,
        answerSoundUrl: dataUrls.answerSoundUrl,
      }),
    }, signal, (progress) => {
      report(progress.label, mapChartPreviewProgress(progress.value, resourceEnd, 1));
    });
  } catch (error) {
    disposeChartPreviewSessionDirectory(directory);
    throw error;
  }
}

export function chartPreviewAllowsFileAccess(): boolean {
  return Platform.OS === 'android' || Platform.OS === 'ios';
}
