/** 导出为 AstroDX 可导入的 adx.zip。 */

import { maimaiJacketUrl } from '@/domain/maimai-assets';
import {
  maimaiChartPreviewChartId,
  maimaiChartPreviewMusicUrl,
  maimaiChartPreviewSimaiUrl,
  maimaiChartPreviewVideoUrl,
} from '@/domain/maimai-chart-preview';
import type { ChartType } from '@/domain/models';
import {
  ChartPackageDownloadCancelledError as MaimaiChartDownloadCancelledError,
  ChartPackageDownloadError as MaimaiChartDownloadError,
  chartPackageNameWithSuffix,
  type ChartPackageDownloadOptions,
  type ChartPackageDownloadProgress,
} from '@/features/chart-download-shared/chart-download-shared';
import { downloadSimaiPackage } from '@/features/chart-download-shared/simai-package';

export { MaimaiChartDownloadCancelledError, MaimaiChartDownloadError };
export type MaimaiChartDownloadProgress = ChartPackageDownloadProgress;
export type MaimaiChartDownloadOptions = ChartPackageDownloadOptions;

export type MaimaiChartDownloadRequest = {
  songId: string;
  chartType: ChartType;
  levelIndex: number;

  levelLabel: string;
  title: string;
  includeVideo: boolean;
};

export function maimaiChartPackageName(
  title: string,
  chartType: ChartType,
  levelLabel: string,
): string {
  return chartPackageNameWithSuffix(title, `${chartType} ${levelLabel}`);
}

export async function downloadMaimaiChartPackage(
  request: MaimaiChartDownloadRequest,
  options: MaimaiChartDownloadOptions = {},
): Promise<boolean> {
  const chartId = maimaiChartPreviewChartId(request.songId, request.chartType);
  return downloadSimaiPackage({ title: request.title, suffix: `${request.chartType} ${request.levelLabel}`, extension: '.adx.zip', resources: [
    { fileName: 'maidata.txt', url: maimaiChartPreviewSimaiUrl(chartId) },
    { fileName: 'track.mp3', url: maimaiChartPreviewMusicUrl(chartId) },
    { fileName: 'bg.png', url: maimaiJacketUrl(request.songId) },
    ...(request.includeVideo ? [{ fileName: 'pv.mp4', url: maimaiChartPreviewVideoUrl(chartId) }] : []),
  ] }, options);
}
