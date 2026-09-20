import { Directory, File } from 'expo-file-system';
import { Platform } from 'react-native';
import { downloadChartResource } from '@/features/chart-download-shared/chart-download-shared';
import {
  createChartPreviewSessionDirectory,
  disposeChartPreviewSessionDirectory,
} from '@/features/chart-preview-shared/chart-preview-assets';
import { prepareChartPreviewWebviewFromPlan } from '@/features/chart-preview-shared/prepare-chart-preview-webview-from-plan';
import {
  CHART_PREVIEW_PLAYER_LABEL,
  CHART_PREVIEW_RESOURCE_LABEL,
  chartPreviewDownloadFraction,
  mapChartPreviewProgress,
  weightedChartPreviewProgress,
  type ChartPreviewLoadProgress,
} from '@/features/chart-preview-shared/chart-preview-progress';
import {
  loadRizlineChartPreviewResources,
  type RizlineChartPreviewAsset,
} from '@/domain/rizline-chart-preview';
import { captureResourceWrites } from '@/services/snapshot-cache-utils';
import {
  normalizeRizlineChartPreviewSettings,
  type RizlineChartPreviewTarget,
} from './configuration';
import { applyRizlineChartPreviewConfigToHtml } from './rizline-chart-preview-inject';

const DIRECTORY_NAME = 'rranker-rizline-chart-preview';
const PREVIEW_RESOURCE_FILES = ['preview-chart.json', 'preview-music.m4a'] as const;
const CHART_DATA_FILE = 'chart-data.js';
const MUSIC_DATA_FILE = 'music-data.js';
const RESOURCE_END = 0.7;

// Metro 静态资源模块编号只能在运行时 require 取得（模块级常量），
// 改写为 import 需补齐 .html/.bundle 的模块声明且无行为收益。

const HTML_MODULE = require('../../../assets/rizline-chart-preview/index.html') as number;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PLAYER_MODULE = require('../../../assets/rizline-chart-preview/player.bundle') as number;

export function createRizlinePreviewResourceRead(
  directory: Directory,
  signal: AbortSignal,
  onProgress?: (progress: ChartPreviewLoadProgress) => void,
): (asset: RizlineChartPreviewAsset, index: number) => Promise<Uint8Array> {
  const fractions = [0, 0];
  const weights = [1, 1];
  const emit = () => {
    onProgress?.({
      label: CHART_PREVIEW_RESOURCE_LABEL,
      value: weightedChartPreviewProgress(
        fractions.map((fraction, index) => ({
          weight: weights[index] ?? 1,
          fraction,
        })),
      ),
    });
  };
  return async (asset, index) => {
    weights[index] = asset.size > 0 ? asset.size : 1;
    const fileName = PREVIEW_RESOURCE_FILES[index] ?? `preview-resource-${index}`;
    const file = await downloadChartResource(
      directory,
      fileName,
      asset.url,
      signal,
      ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
        fractions[index] = chartPreviewDownloadFraction(
          totalBytesWritten,
          totalBytesExpectedToWrite,
          asset.size,
        );
        emit();
      },
    );
    fractions[index] = 1;
    emit();
    return await file.bytes();
  };
}

/** 谱面与音频写成会话目录脚本；iOS file:// 下无法 fetch 本地文件。 */
async function writeRizlinePreviewDataScripts(directory: Directory, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw signal.reason ?? new Error('操作已取消');
  const chartFile = new File(directory, PREVIEW_RESOURCE_FILES[0]);
  const musicFile = new File(directory, PREVIEW_RESOURCE_FILES[1]);
  const chartText = new TextDecoder('utf-8', { fatal: true }).decode(await chartFile.bytes()).replace(/^\uFEFF/u, '');
  try {
    JSON.parse(chartText);
  } catch {
    throw new Error('谱面文件无法解析');
  }
  const musicBase64 = await musicFile.base64();
  if (signal?.aborted) throw signal.reason ?? new Error('操作已取消');
  const chartData = new File(directory, CHART_DATA_FILE);
  chartData.create({ overwrite: true });
  chartData.write(`window.__RIZLINE_CHART_PREVIEW_CHART__=${chartText};`);
  const musicData = new File(directory, MUSIC_DATA_FILE);
  musicData.create({ overwrite: true });
  musicData.write(`window.__RIZLINE_CHART_PREVIEW_MUSIC__=${JSON.stringify(musicBase64)};`);
  if (chartFile.exists) chartFile.delete();
  if (musicFile.exists) musicFile.delete();
}

export async function prepareRizlineChartPreviewWebViewSource(
  target: RizlineChartPreviewTarget,
  theme: 'light' | 'dark',
  settings: unknown,
  signal: AbortSignal,
  onProgress?: (progress: ChartPreviewLoadProgress) => void,
) {
  const assertCurrent = captureResourceWrites('shared', signal);
  assertCurrent();
  const directory = createChartPreviewSessionDirectory(DIRECTORY_NAME);
  try {
    const bundle = await loadRizlineChartPreviewResources(
      target,
      signal,
      createRizlinePreviewResourceRead(directory, signal, (progress) => {
        onProgress?.({
          label: progress.label,
          value: mapChartPreviewProgress(progress.value, 0, RESOURCE_END),
        });
      }),
    );
    assertCurrent();
    onProgress?.({ label: CHART_PREVIEW_PLAYER_LABEL, value: RESOURCE_END });
    const prepared = await prepareChartPreviewWebviewFromPlan({
      directoryName: DIRECTORY_NAME,
      directory,
      stagedAssets: [
        { fileName: 'player.js', moduleId: PLAYER_MODULE },
      ],
      writers: [writeRizlinePreviewDataScripts],
      htmlModuleId: HTML_MODULE,
      buildHtml: (template) => {
        assertCurrent();
        return applyRizlineChartPreviewConfigToHtml(template, {
          theme,
          title: target.title ?? `${bundle.song.title} ${bundle.chart.difficulty}`,
          settings: normalizeRizlineChartPreviewSettings(settings),
        });
      },
    }, signal, (progress) => onProgress?.({
      label: progress.label,
      value: mapChartPreviewProgress(progress.value, RESOURCE_END, 1),
    }));
    assertCurrent();
    return prepared;
  } catch (error) {
    disposeChartPreviewSessionDirectory(directory);
    throw error;
  }
}

export function rizlineChartPreviewAllowsFileAccess(): boolean {
  return Platform.OS === 'android' || Platform.OS === 'ios';
}
