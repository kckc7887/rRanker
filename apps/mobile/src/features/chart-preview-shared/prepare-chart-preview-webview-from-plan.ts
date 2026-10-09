import { Directory, File } from 'expo-file-system';
import { copyAsync, deleteAsync, getInfoAsync, moveAsync, writeAsStringAsync } from 'expo-file-system/legacy';
import { loadItemsBounded } from '@/services/offset-pagination';
import { createInflightGuard, captureResourceWrites, resourceWriteGeneration } from '@/services/snapshot-cache-utils';
import { downloadChartResource } from '@/features/chart-download-shared/chart-download-shared';
import { runSharedCacheFileOperation } from '@/features/storage-management/fs-storage';
import { recordRuntimeError } from '@/services/runtime-diagnostics-recorder';
import {
  createChartPreviewSessionDirectory,
  disposeChartPreviewSessionDirectory,
  loadAssetFileUri,
  readAssetText,
  stageAsset,
} from './chart-preview-assets';
import {
  CHART_PREVIEW_PLAYER_LABEL,
  CHART_PREVIEW_RESOURCE_LABEL,
  chartPreviewDownloadFraction,
  createChartPreviewProgressReporter,
  weightedChartPreviewProgress,
  type ChartPreviewLoadProgress,
} from './chart-preview-progress';

export type ChartPreviewStagedAsset =
  | { fileName: string; moduleId: number }
  | { fileName: string; url: string; bytes: number; cacheRevision?: string };

export type ChartPreviewDataUrlAsset =
  | { key: string; moduleId: number; fileName: string }
  | { key: string; fileName: string; url: string; bytes: number; cacheRevision?: string };

export type ChartPreviewWebviewPlan = {

  directoryName: string;

  directory?: Directory;

  remoteCacheDirectory?: Directory;

  stagedAssets: readonly ChartPreviewStagedAsset[];

  dataUrlAssets?: readonly ChartPreviewDataUrlAsset[];

  writers?: readonly ((directory: Directory, signal?: AbortSignal) => Promise<void>)[];

  htmlModuleId: number;

  buildHtml: (template: string, dataUrls: Record<string, string>, directory: Directory) => string;
};

export type ChartPreviewWebviewPlanResult = {
  uri: string;
  allowingReadAccessToURL: string;
  dispose: () => Promise<void>;
};

const REMOTE_STAGE_CONCURRENCY = 4;
const DOWNLOAD_END = 0.85;

const remoteLoads = createInflightGuard<string>();
let partSequence = 0;

function isRemoteAsset(asset: ChartPreviewStagedAsset | ChartPreviewDataUrlAsset): asset is { fileName: string; url: string; bytes: number } {
  return 'url' in asset && 'bytes' in asset;
}

function remoteKey(asset: { fileName: string; url: string; cacheRevision?: string }): string {
  return `${asset.cacheRevision ?? ''}\0${asset.url}\0${asset.fileName}`;
}

function cacheStorageName(fileName: string, cacheRevision?: string): string {
  if (!cacheRevision) return fileName;
  const slash = fileName.lastIndexOf('/');
  const directory = slash >= 0 ? fileName.slice(0, slash + 1) : '';
  const base = slash >= 0 ? fileName.slice(slash + 1) : fileName;
  return `${directory}${cacheRevision}_${base}`;
}

function remoteWeight(asset: { bytes: number }): number {
  return asset.bytes > 0 ? asset.bytes : 1;
}

async function downloadRemoteAsset(
  url: string,
  bytes: number,
  directory: Directory,
  fileName: string,
  signal?: AbortSignal,
  onFraction?: (fraction: number) => void,
): Promise<File> {
  if (signal?.aborted) throw signal.reason ?? new Error('操作已取消');
  const assertCurrent = captureResourceWrites('shared', signal);
  const target = new File(directory, fileName);
  const info = await getInfoAsync(target.uri);
  if (info.exists && info.size > 0) {
    onFraction?.(1);
    return target;
  }
  const partName = fileName + '.' + (++partSequence) + '.part';
  const part = new File(directory, partName);
  let published = false;
  try {
    await downloadChartResource(directory, partName, url, signal, ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
      onFraction?.(chartPreviewDownloadFraction(totalBytesWritten, totalBytesExpectedToWrite, bytes));
    });
    await runSharedCacheFileOperation(async () => {
      assertCurrent();
      await deleteAsync(target.uri, { idempotent: true });
      assertCurrent();
      await moveAsync({ from: part.uri, to: target.uri });
      published = true;
      assertCurrent();
    });
    onFraction?.(1);
    return target;
  } finally {
    if (!published) {
      try { await deleteAsync(part.uri, { idempotent: true }); }
      catch (error) { recordRuntimeError('chart-preview-cleanup', error, false, { phase: 'cleanup' }); }
    }
  }
}

async function stageRemoteAsset(
  url: string,
  bytes: number,
  sessionDirectory: Directory,
  fileName: string,
  cacheDirectory?: Directory,
  signal?: AbortSignal,
  onFraction?: (fraction: number) => void,
  cacheRevision?: string,
): Promise<File> {
  const assertGeneration = captureResourceWrites('shared');
  const sourceDirectory = cacheDirectory ?? sessionDirectory;
  const storedName = cacheDirectory ? cacheStorageName(fileName, cacheRevision) : fileName;
  ensureParentDirectory(sourceDirectory, storedName);
  if (signal?.aborted) throw signal.reason ?? new Error('操作已取消');
  const source = cacheDirectory
    ? await remoteLoads.share(JSON.stringify([sourceDirectory.uri, storedName, url, cacheRevision ?? '', resourceWriteGeneration('shared')]),
      sharedSignal => { assertGeneration(); return downloadRemoteAsset(url, bytes, sourceDirectory, storedName, sharedSignal, onFraction); }, signal)
    : await downloadRemoteAsset(url, bytes, sourceDirectory, fileName, signal, onFraction);
  onFraction?.(1);
  if (signal?.aborted) throw signal.reason ?? new Error('操作已取消');
  assertGeneration();
  if (!cacheDirectory) return source;

  ensureParentDirectory(sessionDirectory, fileName);
  const target = new File(sessionDirectory, fileName);
  const [targetInfo, sourceInfo] = await Promise.all([getInfoAsync(target.uri), getInfoAsync(source.uri)]);
  if (targetInfo.exists && sourceInfo.exists && targetInfo.size === sourceInfo.size) return target;
  await deleteAsync(target.uri, { idempotent: true });
  if (signal?.aborted) throw signal.reason ?? new Error('操作已取消');
  assertGeneration();
  await copyAsync({ from: source.uri, to: target.uri });
  return target;
}

function ensureParentDirectory(directory: Directory, fileName: string): void {
  const separatorIndex = fileName.lastIndexOf('/');
  if (separatorIndex > 0) {
    new Directory(directory, fileName.slice(0, separatorIndex))
      .create({ intermediates: true, idempotent: true });
  }
}

export async function prepareChartPreviewWebviewFromPlan(
  plan: ChartPreviewWebviewPlan,
  signal?: AbortSignal,
  onProgress?: (progress: ChartPreviewLoadProgress) => void,
): Promise<ChartPreviewWebviewPlanResult> {
  const assertCurrent = captureResourceWrites('shared', signal);
  assertCurrent();
  const directory = plan.directory ?? await createChartPreviewSessionDirectory(plan.directoryName);
  const remotes = [...plan.stagedAssets, ...(plan.dataUrlAssets ?? [])].filter(isRemoteAsset);
  const fractions = new Map(remotes.map((asset) => [remoteKey(asset), 0]));
  const downloadEnd = remotes.length > 0 ? DOWNLOAD_END : 0;
  const report = createChartPreviewProgressReporter(onProgress);
  const emitDownload = () => {
    if (remotes.length === 0) return;
    report(CHART_PREVIEW_RESOURCE_LABEL, weightedChartPreviewProgress(
      remotes.map((asset) => ({
        weight: remoteWeight(asset),
        fraction: fractions.get(remoteKey(asset)) ?? 0,
      })),
    ) * downloadEnd);
  };
  const markRemote = (asset: { fileName: string; url: string }, fraction: number) => {
    const key = remoteKey(asset);
    fractions.set(key, Math.max(fractions.get(key) ?? 0, fraction));
    emitDownload();
  };

  try {
    await loadItemsBounded({ items: plan.stagedAssets, concurrency: REMOTE_STAGE_CONCURRENCY,
      signal, failureMode: 'throw', load: async (asset) => {
      assertCurrent();
      ensureParentDirectory(directory, asset.fileName);
      if ('moduleId' in asset) {
        await stageAsset(asset.moduleId, asset.fileName, directory, signal);
      } else {
        await stageRemoteAsset(
          asset.url,
          asset.bytes,
          directory,
          asset.fileName,
          plan.remoteCacheDirectory,
          signal,
          (fraction) => markRemote(asset, fraction),
          asset.cacheRevision,
        );
      }
      assertCurrent();
    } });

    const dataUrls: Record<string, string> = {};
    for (const asset of plan.dataUrlAssets ?? []) {
      assertCurrent();
      if ('moduleId' in asset) {
        const sourceUri = await loadAssetFileUri(asset.moduleId, asset.fileName);
        dataUrls[asset.key] = `data:audio/wav;base64,${await new File(sourceUri).base64()}`;
      } else {
        const staged = await stageRemoteAsset(
          asset.url,
          asset.bytes,
          directory,
          asset.fileName,
          plan.remoteCacheDirectory,
          signal,
          (fraction) => markRemote(asset, fraction),
          asset.cacheRevision,
        );
        dataUrls[asset.key] = `data:audio/wav;base64,${await staged.base64()}`;
      }
    }

    const finishTotal = (plan.writers?.length ?? 0) + 1;
    let finishDone = 0;
    const emitFinish = () => {
      finishDone += 1;
      report(
        CHART_PREVIEW_PLAYER_LABEL,
        downloadEnd + (finishDone / finishTotal) * (1 - downloadEnd),
      );
    };
    report(CHART_PREVIEW_PLAYER_LABEL, downloadEnd > 0 ? downloadEnd : 0.2);

    for (const writer of plan.writers ?? []) {
      assertCurrent();
      await writer(directory, signal);
      assertCurrent();
      emitFinish();
    }

    const template = await readAssetText(plan.htmlModuleId);
    assertCurrent();
    const html = plan.buildHtml(template, dataUrls, directory);
    const htmlFile = new File(directory, 'index.html');
    await writeAsStringAsync(htmlFile.uri, html);
    assertCurrent();
    emitFinish();

    return {
      uri: htmlFile.uri,
      allowingReadAccessToURL: directory.uri,
      dispose: () => disposeChartPreviewSessionDirectory(directory),
    };
  } catch (error) {
    await disposeChartPreviewSessionDirectory(directory);
    throw error;
  }
}
