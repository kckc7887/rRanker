/**
 * 舞萌谱面下载：按 AstroDX 关卡结构打包 LXNS 谱面资源，
 * 调起系统目录选择页由玩家自选保存位置。
 * 资源 URL 复用 domain/maimai-chart-preview 与 domain/maimai-assets 公共路径。
 */

import JSZip from 'jszip';
import { Directory, File, Paths } from 'expo-file-system';
import {
  createDownloadResumable,
  type DownloadProgressData,
} from 'expo-file-system/legacy';
import { maimaiJacketUrl } from '@/domain/maimai-assets';
import {
  maimaiChartPreviewChartId,
  maimaiChartPreviewMusicUrl,
  maimaiChartPreviewSimaiUrl,
  maimaiChartPreviewVideoUrl,
} from '@/domain/maimai-chart-preview';
import type { ChartType } from '@/domain/models';

export class MaimaiChartDownloadError extends Error {}
export class MaimaiChartDownloadCancelledError extends Error {}

export type MaimaiChartDownloadProgress = {
  phase: 'downloading' | 'organizing';
  progress: number;
};

export type MaimaiChartDownloadOptions = {
  signal?: AbortSignal;
  onProgress?: (progress: MaimaiChartDownloadProgress) => void;
  onReadyToSave?: () => void | Promise<void>;
};

export type MaimaiChartDownloadRequest = {
  songId: string;
  chartType: ChartType;
  levelIndex: number;
  /** 用于包名展示的难度标级（UTAGE 为宴名）。 */
  levelLabel: string;
  title: string;
  includeVideo: boolean;
};

const SAFE_NAME_MAX_LENGTH = 40;
let sessionSequence = 0;

/** AstroDX 只认 zip 内的关卡文件夹；文件/文件夹名任意，仅需合法字符。 */
function safeNamePart(value: string): string {
  const normalized = value.normalize('NFKC').trim().replace(/[<>:"/\\|?*\u0000-\u001F]/gu, '_');
  return normalized.slice(0, SAFE_NAME_MAX_LENGTH) || 'chart';
}

export function maimaiChartPackageName(
  title: string,
  chartType: ChartType,
  levelLabel: string,
): string {
  const suffix = ` ${chartType} ${levelLabel}`;
  const titleBudget = Math.max(0, SAFE_NAME_MAX_LENGTH - suffix.length);
  const normalizedTitle = title.normalize('NFKC').trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/gu, '_');
  return safeNamePart(`${normalizedTitle.slice(0, titleBudget)}${suffix}`);
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

function isDirectoryPickerCancellation(error: unknown): boolean {
  const candidate = error as { code?: unknown; message?: unknown } | null;
  if (!candidate || typeof candidate !== 'object') return false;
  if (typeof candidate.code === 'string' && /cancell/iu.test(candidate.code)) return true;
  return typeof candidate.message === 'string' && /cancell?ed by the user/iu.test(candidate.message);
}

function throwIfCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw new MaimaiChartDownloadCancelledError('谱面下载已取消');
}

async function downloadTo(
  directory: Directory,
  fileName: string,
  url: string,
  signal?: AbortSignal,
  onProgress?: (progress: DownloadProgressData) => void,
): Promise<File> {
  const file = new File(directory, fileName);
  throwIfCancelled(signal);
  const task = createDownloadResumable(url, file.uri, {}, onProgress);
  const cancelDownload = () => {
    void task.cancelAsync().catch(() => undefined);
  };
  signal?.addEventListener('abort', cancelDownload, { once: true });
  try {
    const result = await task.downloadAsync();
    throwIfCancelled(signal);
    if (!result) throw new MaimaiChartDownloadCancelledError('谱面下载已取消');
    if (!file.exists || file.size <= 0) {
      throw new MaimaiChartDownloadError(`下载内容为空：${fileName}`);
    }
    return file;
  } catch (error) {
    if (signal?.aborted || error instanceof MaimaiChartDownloadCancelledError) {
      throw new MaimaiChartDownloadCancelledError('谱面下载已取消', { cause: error });
    }
    throw new MaimaiChartDownloadError(`无法下载谱面资源：${fileName}`, { cause: error });
  } finally {
    signal?.removeEventListener('abort', cancelDownload);
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
  const packageName = maimaiChartPackageName(request.title, request.chartType, request.levelLabel);

  sessionSequence += 1;
  const staging = new Directory(Paths.cache, `rranker-chart-download-${Date.now()}-${sessionSequence}`);
  staging.create({ intermediates: true, idempotent: true });
  try {
    const resources = [
      { fileName: 'maidata.txt', url: maimaiChartPreviewSimaiUrl(chartId) },
      { fileName: 'track.mp3', url: maimaiChartPreviewMusicUrl(chartId) },
      { fileName: 'bg.png', url: maimaiJacketUrl(request.songId) },
      ...(request.includeVideo
        ? [{ fileName: 'pv.mp4', url: maimaiChartPreviewVideoUrl(chartId) }]
        : []),
    ];
    const downloadedFiles = new Map<string, File>();
    for (const [index, resource] of resources.entries()) {
      throwIfCancelled(options.signal);
      options.onProgress?.({ phase: 'downloading', progress: index / resources.length });
      const file = await downloadTo(
        staging,
        resource.fileName,
        resource.url,
        options.signal,
        ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
          const fileProgress = totalBytesExpectedToWrite > 0
            ? Math.min(1, totalBytesWritten / totalBytesExpectedToWrite)
            : 0;
          options.onProgress?.({
            phase: 'downloading',
            progress: (index + fileProgress) / resources.length,
          });
        },
      );
      downloadedFiles.set(resource.fileName, file);
      options.onProgress?.({ phase: 'downloading', progress: (index + 1) / resources.length });
    }

    const chartFile = downloadedFiles.get('maidata.txt')!;
    const musicFile = downloadedFiles.get('track.mp3')!;
    const jacketFile = downloadedFiles.get('bg.png')!;
    const videoFile = downloadedFiles.get('pv.mp4');

    options.onProgress?.({ phase: 'organizing', progress: 0 });
    throwIfCancelled(options.signal);
    const zip = new JSZip();
    const folder = zip.folder(packageName);
    if (!folder) throw new MaimaiChartDownloadError('无法创建谱面压缩包目录');
    folder.file('maidata.txt', await chartFile.text());
    folder.file('track.mp3', await musicFile.bytes());
    folder.file('bg.png', await jacketFile.bytes());
    if (videoFile) folder.file('pv.mp4', await videoFile.bytes());
    // 谱面媒体已是压缩格式，STORE 免去压缩峰值内存。
    const zipBytes = await zip.generateAsync(
      { type: 'uint8array', compression: 'STORE' },
      ({ percent }) => options.onProgress?.({
        phase: 'organizing',
        progress: Math.min(1, Math.max(0, percent / 100)),
      }),
    );
    throwIfCancelled(options.signal);
    options.onProgress?.({ phase: 'organizing', progress: 1 });
    await options.onReadyToSave?.();
    throwIfCancelled(options.signal);

    try {
      const picked = await Directory.pickDirectoryAsync();
      const output = picked.createFile(`${packageName}.adx.zip`, 'application/zip');
      output.write(zipBytes);
      return true;
    } catch (error) {
      if (isDirectoryPickerCancellation(error)) return false;
      throw new MaimaiChartDownloadError('无法打开保存位置选择', { cause: error });
    }
  } finally {
    if (staging.exists) staging.delete();
  }
}
