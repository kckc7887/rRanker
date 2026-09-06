/**
 * 舞萌谱面下载：按 AstroDX 关卡结构打包 LXNS 谱面资源，
 * 调起系统目录选择页由玩家自选保存位置。
 * 资源 URL 复用 domain/maimai-chart-preview 与 domain/maimai-assets 公共路径。
 */

import { downloadSimaiPackage } from '@/features/chart-download-shared/simai-package';
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

export { MaimaiChartDownloadCancelledError, MaimaiChartDownloadError };
export type MaimaiChartDownloadProgress = ChartPackageDownloadProgress;
export type MaimaiChartDownloadOptions = ChartPackageDownloadOptions;

export type MaimaiChartDownloadRequest = {
  songId: string;
  chartType: ChartType;
  levelIndex: number;
  /** 用于包名展示的难度标级（UTAGE 为宴名）。 */
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

/** LXNS 背景视频按曲提供；HEAD 探测 200 视为可用，网络异常按不可用处理。 */
export async function checkMaimaiChartVideoAvailable(chartId: number): Promise<boolean> {
  try {
    const response = await fetch(maimaiChartPreviewVideoUrl(chartId), { method: 'HEAD' });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * 下载谱面文本、音频、封面（可选背景视频），打包为 AstroDX 可导入的
 * `{名称}.adx.zip`，由玩家在系统目录选择页中确定保存位置。
 * 返回 true 表示已保存；玩家取消选择返回 false；其余失败抛出 MaimaiChartDownloadError。
 */
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
