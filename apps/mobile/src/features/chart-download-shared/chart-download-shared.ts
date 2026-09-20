import { Directory, File, Paths } from 'expo-file-system';
import {
  createDownloadResumable,
  type DownloadProgressData,
} from 'expo-file-system/legacy';
import { ProviderError, providerErrorFromStatus, type ProviderErrorCode } from '@/providers/errors';
import { nextRuntimeOperationId, recordRuntimeDiagnostic } from '@/services/runtime-diagnostics-recorder';

export class ChartPackageDownloadError extends ProviderError {
  constructor(message: string, options?: ErrorOptions, code: ProviderErrorCode = 'unknown', retryable = false) {
    super(code, message, retryable, options);
  }
}
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
  const diagnostic = { source: 'chart-resource-download', scenario: 'resource', operationId: nextRuntimeOperationId() };
  const started = Date.now();
  let status: number | undefined;
  let resultState = 'error';
  let diagnosticError: unknown;
  void recordRuntimeDiagnostic('request-start', diagnostic);
  let discarded = false;
  const cleanup = () => {
    try { if (file.exists) file.delete(); } catch { /* Session cleanup also owns failed downloads. */ }
  };
  const task = createDownloadResumable(url, file.uri, {}, (progress) => {
    if (!discarded && !signal?.aborted) onProgress?.(progress);
  });
  let rejectCancelled: (error: ChartPackageDownloadCancelledError) => void = () => {};
  const cancelled = new Promise<never>((_resolve, reject) => { rejectCancelled = reject; });
  const cancelDownload = () => {
    discarded = true;
    rejectCancelled(new ChartPackageDownloadCancelledError('谱面下载已取消', { cause: signal?.reason }));
    void Promise.resolve().then(() => task.cancelAsync()).catch(() => undefined);
    cleanup();
  };
  signal?.addEventListener('abort', cancelDownload, { once: true });
  try {
    if (signal?.aborted) cancelDownload();
    const pending = Promise.resolve().then(() => {
      throwIfChartDownloadCancelled(signal);
      return task.downloadAsync();
    });
    // Native cancellation can settle after the caller has already left. Reap only
    // this task's file again when its final callback eventually arrives.
    void pending.then(() => { if (discarded) cleanup(); }, () => { if (discarded) cleanup(); });
    const result = await Promise.race([pending, cancelled]);
    throwIfChartDownloadCancelled(signal);
    if (!result) throw new ChartPackageDownloadCancelledError('谱面下载已取消');
    status = result.status;
    if (!Number.isInteger(status) || status < 200 || status >= 300) {
      throw providerErrorFromStatus(result.status, {
        permission: '下载服务暂时无法提供该资源', noData: '下载服务未找到该资源',
        rateLimit: '下载请求过于频繁，请稍后重试', server: '下载服务暂时不可用',
        fallback: { message: (status) => `资源下载返回 HTTP ${status}`, code: 'network' },
      });
    }
    if (!file.exists || file.size <= 0) {
      throw new ProviderError('upstream_schema', '下载内容为空', true);
    }
    resultState = 'success';
    return file;
  } catch (error) {
    discarded = true;
    cleanup();
    if (signal?.aborted || error instanceof ChartPackageDownloadCancelledError) {
      resultState = 'cancelled';
      throw new ChartPackageDownloadCancelledError('谱面下载已取消', { cause: error });
    }
    diagnosticError = error instanceof ChartPackageDownloadError ? error
      : error instanceof ProviderError
        ? new ChartPackageDownloadError(error.message, { cause: error }, error.code, error.retryable)
        : new ChartPackageDownloadError('无法下载谱面资源', { cause: error }, 'network', true);
    throw diagnosticError;
  } finally {
    signal?.removeEventListener('abort', cancelDownload);
    void recordRuntimeDiagnostic('request', {
      ...diagnostic, result: resultState, status, durationMs: Date.now() - started,
      errorCode: resultState === 'cancelled' ? 'cancelled' : diagnosticError instanceof ProviderError ? diagnosticError.code : undefined,
      error: diagnosticError,
    });
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
