import { File, type Directory } from 'expo-file-system';
import type { DownloadProgressData } from 'expo-file-system/legacy';
import JSZip from 'jszip';
import {
  chartPackageNameWithSuffix,
  cleanupChartDownloadSessionDirectory,
  createChartDownloadSessionDirectory,
  downloadChartResource,
  saveChartPackage,
  throwIfChartDownloadCancelled,
  type ChartPackageDownloadOptions,
} from '@/features/chart-download-shared/chart-download-shared';
import {
  CHART_PREVIEW_DOWNLOAD_BUDGET_MESSAGE,
  CHART_PREVIEW_MAX_DOWNLOAD_BYTES,
  chartPreviewDeclaredUncompressedSize,
  ChartPreviewBudgetExceededError,
  createChartPreviewActualBytes,
  readBudgetedZipEntry,
  scanChartPreviewArchiveEntries,
} from '@/features/chart-preview-shared/chart-preview-resource-budget';
import { OSU_BEATMAPSET_DOWNLOAD_ROOT } from '@/providers/osu-config';
import { ProviderError } from '@/providers/errors';
import { captureResourceWrites, subscribeResourceWrites } from '@/services/snapshot-cache-utils';

const DOWNLOAD_IDLE_TIMEOUT_MS = 15_000;
/**
 * 普通谱包导出独立预算：与预览同值但符号与文案独立，可单独调整。
 * 同值理由：校验的瞬时内存约束由设备决定，不因子功能放宽。
 */
export const OSU_BEATMAPSET_PACKAGE_MAX_BYTES = 256 * 1024 * 1024;
export const OSU_BEATMAPSET_PACKAGE_OVERSIZE_MESSAGE = '谱包过大，暂不支持下载';
let archiveSequence = 0;

export type OsuBeatmapsetArchiveOptions = {
  signal?: AbortSignal;
  onProgress?: (progress: DownloadProgressData) => void;
  /** Validation owns its temporary outputs and must discard them on failure or cancellation. */
  validate?: (file: File, signal: AbortSignal) => Promise<void>;
  /** 下载传输与落盘文件的字节上限，默认预览预算；超出即拒绝且不再切源。 */
  maxArchiveBytes?: number;
  /** 超出上限时的错误文案。 */
  oversizeMessage?: string;
};

export function osuBeatmapsetPackageName(title: string, beatmapsetId: number): string {
  return `${chartPackageNameWithSuffix(title, String(beatmapsetId))}.osz`;
}

export function osuBeatmapsetDownloadUrl(beatmapsetId: number, includeVideo: boolean): string {
  return `${OSU_BEATMAPSET_DOWNLOAD_ROOT}/${includeVideo ? 'full' : 'novideo'}/${beatmapsetId}`;
}

export async function downloadOsuBeatmapsetArchive(
  directory: Directory,
  request: { beatmapsetId: number; includeVideo: boolean },
  options: OsuBeatmapsetArchiveOptions = {},
): Promise<File> {
  const signal = options.signal;
  const assertCurrent = captureResourceWrites('shared', signal);
  const maxArchiveBytes = options.maxArchiveBytes ?? CHART_PREVIEW_MAX_DOWNLOAD_BYTES;
  const oversizeMessage = options.oversizeMessage ?? CHART_PREVIEW_DOWNLOAD_BUDGET_MESSAGE;
  const { beatmapsetId, includeVideo } = request;
  const urls = [
    osuBeatmapsetDownloadUrl(beatmapsetId, includeVideo),
    `https://osu.direct/api/d/${beatmapsetId}${includeVideo ? '' : '?noVideo=1'}`,
    ...(includeVideo ? [`https://catboy.best/d/${beatmapsetId}`] : []),
    `https://api.nerinyan.moe/d/${beatmapsetId}${includeVideo ? '' : '?nv=1'}`,
  ];
  let lastError: unknown;
  for (const url of urls) {
    assertCurrent();
    const controller = new AbortController();
    const fileName = `beatmapset-${++archiveSequence}.osz`;
    const attemptFile = new File(directory, fileName);
    const unsubscribe = subscribeResourceWrites('shared', () => controller.abort(new Error('缓存请求已失效')));
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    let receivedBytes = 0;
    let discarded = false;
    let budgetExceeded: ChartPreviewBudgetExceededError | undefined;
    const cleanup = () => {
      try { if (attemptFile.exists) attemptFile.delete(); } catch { /* Session cleanup retries removal. */ }
    };
    const onExternalAbort = () => controller.abort(signal?.reason);
    signal?.addEventListener('abort', onExternalAbort, { once: true });
    const resetIdleTimer = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => controller.abort(
        new ProviderError('timeout', '谱面资源下载暂时没有响应', true),
      ), DOWNLOAD_IDLE_TIMEOUT_MS);
    };
    const assertAttempt = () => {
      assertCurrent();
      if (controller.signal.aborted) throw controller.signal.reason;
    };
    let rejectAborted: (reason: unknown) => void = () => {};
    const aborted = new Promise<never>((_resolve, reject) => { rejectAborted = reject; });
    const onAttemptAbort = () => rejectAborted(controller.signal.reason);
    controller.signal.addEventListener('abort', onAttemptAbort, { once: true });
    resetIdleTimer();
    const pending = (async () => {
      assertAttempt();
      const file = await downloadChartResource(directory, fileName, url, controller.signal, (progress) => {
        if (discarded || controller.signal.aborted) return;
        if (progress.totalBytesWritten > maxArchiveBytes) {
          budgetExceeded ??= new ChartPreviewBudgetExceededError(oversizeMessage);
          controller.abort(budgetExceeded);
          return;
        }
        try { assertCurrent(); } catch (error) { controller.abort(error); return; }
        if (progress.totalBytesWritten > receivedBytes) {
          receivedBytes = progress.totalBytesWritten;
          resetIdleTimer();
        }
        options.onProgress?.(progress);
      });
      if (idleTimer) clearTimeout(idleTimer);
      assertAttempt();
      if (file.size > maxArchiveBytes) {
        throw new ChartPreviewBudgetExceededError(oversizeMessage);
      }
      if (options.validate) {
        await options.validate(file, controller.signal);
      } else {
        const bytes = await file.bytes();
        assertAttempt();
        const zip = await JSZip.loadAsync(bytes);
        const entries = Object.values(zip.files);
        await scanChartPreviewArchiveEntries(entries, bytes.byteLength, {
          cancellation: { assertCurrent: assertAttempt },
          uncompressedSize: (entry) => chartPreviewDeclaredUncompressedSize(entry),
        });
        if (!entries.some(entry => !entry.dir && /\.osu$/iu.test(entry.name))) {
          throw new ProviderError('upstream_schema', '下载内容中没有谱面', true);
        }
        const actualBytes = createChartPreviewActualBytes();
        for (const entry of entries) {
          if (entry.dir) continue;
          await readBudgetedZipEntry(entry, { assertCurrent: assertAttempt, actualBytes });
        }
      }
      assertAttempt();
      return file;
    })();
    void pending.then(() => { if (discarded) cleanup(); }, () => { if (discarded) cleanup(); });
    try {
      const file = await Promise.race([pending, aborted]);
      assertCurrent();
      return file;
    } catch (error) {
      discarded = true;
      controller.abort(error);
      cleanup();
      // User cancellation and cache invalidation stop the whole chain. Only an
      // individual source's transport/content failure advances to another source.
      assertCurrent();
      // 预算超限说明同一份资源在任何来源都过大，不再换源重试。
      if (budgetExceeded) throw budgetExceeded;
      if (error instanceof ChartPreviewBudgetExceededError) throw error;
      lastError = error;
    } finally {
      if (idleTimer) clearTimeout(idleTimer);
      signal?.removeEventListener('abort', onExternalAbort);
      controller.signal.removeEventListener('abort', onAttemptAbort);
      unsubscribe();
    }
  }
  assertCurrent();
  throw new ProviderError('no_data', '谱面资源暂时无法获取，请稍后重试', true, { cause: lastError });
}

export async function downloadOsuBeatmapsetPackage(
  request: { beatmapsetId: number; title: string; includeVideo: boolean },
  options: ChartPackageDownloadOptions = {},
): Promise<boolean> {
  const signal = options.signal ?? new AbortController().signal;
  const staging = createChartDownloadSessionDirectory();
  try {
    throwIfChartDownloadCancelled(signal);
    const archive = await downloadOsuBeatmapsetArchive(staging, request, {
      signal,
      maxArchiveBytes: OSU_BEATMAPSET_PACKAGE_MAX_BYTES,
      oversizeMessage: OSU_BEATMAPSET_PACKAGE_OVERSIZE_MESSAGE,
      onProgress: ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
        const progress = totalBytesExpectedToWrite > 0
          ? Math.min(1, totalBytesWritten / totalBytesExpectedToWrite)
          : 0;
        options.onProgress?.({ phase: 'downloading', progress });
      },
    });
    throwIfChartDownloadCancelled(signal);
    options.onProgress?.({ phase: 'organizing', progress: 1 });
    await options.onReadyToSave?.();
    throwIfChartDownloadCancelled(signal);
    return await saveChartPackage(
      osuBeatmapsetPackageName(request.title, request.beatmapsetId),
      { kind: 'file', file: archive },
    );
  } finally {
    cleanupChartDownloadSessionDirectory(staging);
  }
}
