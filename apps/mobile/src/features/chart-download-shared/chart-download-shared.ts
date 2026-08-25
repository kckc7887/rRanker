import { Directory, File, Paths } from 'expo-file-system';
import {
  createDownloadResumable,
  type DownloadProgressData,
} from 'expo-file-system/legacy';

export class ChartPackageDownloadError extends Error {}
export class ChartPackageDownloadCancelledError extends Error {}

export type ChartPackageDownloadProgress = {
  phase: 'downloading' | 'organizing';
  progress: number;
};

export type ChartPackageDownloadOptions = {
  signal?: AbortSignal;
  onProgress?: (progress: ChartPackageDownloadProgress) => void;
  onReadyToSave?: () => void | Promise<void>;
};

export type ChartPackageOutput =
  | { kind: 'bytes'; bytes: Uint8Array }
  | { kind: 'file'; file: File };

const SAFE_NAME_MAX_LENGTH = 40;
let sessionSequence = 0;

export function sanitizeChartPackageName(value: string): string {
  const normalized = value.normalize('NFKC').trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/gu, '_');
  return normalized.slice(0, SAFE_NAME_MAX_LENGTH) || 'chart';
}

export function chartPackageNameWithSuffix(title: string, suffix: string): string {
  const normalizedSuffix = suffix.normalize('NFKC').trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/gu, '_');
  const joinedSuffix = normalizedSuffix ? ` ${normalizedSuffix}` : '';
  const titleBudget = Math.max(0, SAFE_NAME_MAX_LENGTH - joinedSuffix.length);
  const normalizedTitle = title.normalize('NFKC').trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/gu, '_');
  return sanitizeChartPackageName(`${normalizedTitle.slice(0, titleBudget)}${joinedSuffix}`);
}

export function throwIfChartDownloadCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw new ChartPackageDownloadCancelledError('谱面下载已取消');
}

export function createChartDownloadSessionDirectory(): Directory {
  sessionSequence += 1;
  const directory = new Directory(Paths.cache, `rranker-chart-download-${Date.now()}-${sessionSequence}`);
  directory.create({ intermediates: true, idempotent: true });
  return directory;
}

export function cleanupChartDownloadSessionDirectory(directory: Directory): void {
  if (directory.exists) directory.delete();
}

export async function downloadChartResource(
  directory: Directory,
  fileName: string,
  url: string,
  signal?: AbortSignal,
  onProgress?: (progress: DownloadProgressData) => void,
): Promise<File> {
  const file = new File(directory, fileName);
  throwIfChartDownloadCancelled(signal);
  const task = createDownloadResumable(url, file.uri, {}, onProgress);
  const cancelDownload = () => {
    void task.cancelAsync().catch(() => undefined);
  };
  signal?.addEventListener('abort', cancelDownload, { once: true });
  try {
    const result = await task.downloadAsync();
    throwIfChartDownloadCancelled(signal);
    if (!result) throw new ChartPackageDownloadCancelledError('谱面下载已取消');
    if (!file.exists || file.size <= 0) {
      throw new ChartPackageDownloadError(`下载内容为空：${fileName}`);
    }
    return file;
  } catch (error) {
    if (signal?.aborted || error instanceof ChartPackageDownloadCancelledError) {
      throw new ChartPackageDownloadCancelledError('谱面下载已取消', { cause: error });
    }
    throw new ChartPackageDownloadError(`无法下载谱面资源：${fileName}`, { cause: error });
  } finally {
    signal?.removeEventListener('abort', cancelDownload);
  }
}

function isDirectoryPickerCancellation(error: unknown): boolean {
  const candidate = error as { code?: unknown; message?: unknown } | null;
  if (!candidate || typeof candidate !== 'object') return false;
  if (typeof candidate.code === 'string' && /cancell/iu.test(candidate.code)) return true;
  return typeof candidate.message === 'string' && /cancell?ed by the user/iu.test(candidate.message);
}

export async function saveChartPackage(
  fileName: string,
  output: ChartPackageOutput,
): Promise<boolean> {
  try {
    const picked = await Directory.pickDirectoryAsync();
    const destination = picked.createFile(fileName, 'application/zip');
    if (output.kind === 'file') output.file.copy(destination);
    else destination.write(output.bytes);
    return true;
  } catch (error) {
    if (isDirectoryPickerCancellation(error)) return false;
    throw new ChartPackageDownloadError('无法打开保存位置选择', { cause: error });
  }
}
