import { formatRizlineConstant, rizlineDifficultyColors } from '@/domain/rizline';
import { Directory, File } from 'expo-file-system';
import { Platform } from 'react-native';
import { downloadChartResource } from '@/features/chart-download-shared/chart-download-shared';
import {
  createChartPreviewSessionDirectory,
  disposeChartPreviewSessionDirectory,
} from '@/features/chart-preview-shared/chart-preview-assets';
import { prepareJsonChartPreview } from '../prepare-json-chart-preview';
import { chartJsonFormat } from '../chart-preview-shared/chart-format';
import {
  CHART_PREVIEW_PLAYER_LABEL,
  CHART_PREVIEW_RESOURCE_LABEL,
  chartPreviewDownloadFraction,
  mapChartPreviewProgress,
  weightedChartPreviewProgress,
  type ChartPreviewLoadProgress,
} from '@/features/chart-preview-shared/chart-preview-progress';
import type { RizlineChartPreviewResourceRead } from '@/domain/rizline-chart-preview';
import { loadRizlineChartPreviewResources } from '@/services/rizline-chart-preview-resources';
import { captureResourceWrites } from '@/services/snapshot-cache-utils';
import type { RizlineChartPreviewTarget } from './configuration';
import type { PgrPreviewSettings } from '../chart-preview-shared/pgr-preview-config';

const DIRECTORY_NAME = 'rranker-rizline-chart-preview';
const PREVIEW_RESOURCE_FILES = ['preview-chart.json', 'preview-music.m4a'] as const;
const RESOURCE_END = 0.7;

function createRizlinePreviewResourceRead(
  directory: Directory,
  signal: AbortSignal,
  onProgress?: (progress: ChartPreviewLoadProgress) => void,
): RizlineChartPreviewResourceRead {
  const fractions = [0, 0];
  const weights = [1, 1];
  const emit = () => {
    onProgress?.({
      label: CHART_PREVIEW_RESOURCE_LABEL,
      value: weightedChartPreviewProgress(
        fractions.map((fraction, index) => ({
          weight: weights[index]!,
          fraction,
        })),
      ),
    });
  };
  return async (asset, index) => {
    weights[index] = asset.size > 0 ? asset.size : 1;
    const fileName = PREVIEW_RESOURCE_FILES[index]!;
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
    return file;
  };
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
  const directory = await createChartPreviewSessionDirectory(DIRECTORY_NAME);
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
    const chartFile = new File(directory, PREVIEW_RESOURCE_FILES[0]);
    const musicFile = new File(directory, PREVIEW_RESOURCE_FILES[1]);
    const chartText = new TextDecoder('utf-8', { fatal: true }).decode(await chartFile.bytes()).replace(/^\uFEFF/u, '');
    const format = chartJsonFormat(JSON.parse(chartText));
    if (!format) throw new Error('不支持的谱面格式');
    const music = await musicFile.base64();
    assertCurrent();
    chartFile.delete();
    musicFile.delete();
    const colors = rizlineDifficultyColors(bundle.chart.difficulty, theme === 'dark');
    const prepared = await prepareJsonChartPreview({
      game: 'rizline', theme, chartText, format, title: target.title ?? bundle.song.title,
      previewDifficulty: { label: bundle.chart.difficulty, value: formatRizlineConstant(bundle.chart.constant),
        background: colors.bg, text: colors.fg },
      settings: settings as PgrPreviewSettings,
    }, music, directory, signal, progress => onProgress?.({
      label: progress.label, value: mapChartPreviewProgress(progress.value, RESOURCE_END, 1),
    }));
    assertCurrent();
    return prepared;
  } catch (error) {
    await disposeChartPreviewSessionDirectory(directory);
    throw error;
  }
}

export function rizlineChartPreviewAllowsFileAccess(): boolean {
  return Platform.OS === 'android' || Platform.OS === 'ios';
}
