/**
 * 谱面确认 WebView prepare 层声明式清单执行器（公共路径）：
 * 各游戏 prepare 模块只声明清单（stage 目录名、落盘资产、data URL 资产、
 * 额外写盘回调、HTML 模板与 buildHtml），由本执行器完成
 * 「stage 目录 → 落盘资产 → data URL 资产 → 额外写盘 → 读模板 →
 * 生成并写入 index.html」，落盘文件集合与返回值由清单决定，不感知具体游戏。
 * 落盘与资产解析复用本目录 chart-preview-assets 公共层，不重复实现。
 * 资产来源用判别联合表达：moduleId 为本地 bundle 资产（每次覆盖落盘），
 * url + bytes 为对象存储远程资产（已缓存且大小匹配时跳过下载）。
 * 远程资产有限并发下载；若提供 remoteCacheDirectory，先写入该目录再复制字节到本次 session。
 */

import { Directory, File } from 'expo-file-system';
import { loadItemsBounded } from '@/services/offset-pagination';
import { createInflightGuard, captureResourceWrites, resourceWriteGeneration } from '@/services/snapshot-cache-utils';
import { downloadChartResource } from '@/features/chart-download-shared/chart-download-shared';
import {
  createChartPreviewSessionDirectory,
  disposeChartPreviewSessionDirectory,
  loadAssetFileUri,
  readAssetText,
  stageAsset,
} from './chart-preview-assets';

export type ChartPreviewStagedAsset =
  | { fileName: string; moduleId: number }
  | { fileName: string; url: string; bytes: number };

export type ChartPreviewDataUrlAsset =
  | { key: string; moduleId: number; fileName: string }
  | { key: string; fileName: string; url: string; bytes: number };

export type ChartPreviewWebviewPlan = {
  /** stage 目录名（舞萌默认 'rranker-chart-preview'，其它游戏自定义）。 */
  directoryName: string;
  /** 由调用方提前创建的同一会话目录；用于先写音乐/RPE 再准备播放器。 */
  directory?: Directory;
  /** 远程资产的持久缓存目录；缺省则直接写入本次 session。 */
  remoteCacheDirectory?: Directory;
  /** 按清单落盘的资产，fileName 支持 'skin/Tap2.png' 形式的相对路径。 */
  stagedAssets: readonly ChartPreviewStagedAsset[];
  /** 生成 data:audio/wav data URL 的资产，结果以 key 汇入传给 buildHtml 的 Record。 */
  dataUrlAssets?: readonly ChartPreviewDataUrlAsset[];
  /** 额外写盘回调（如 music-data.js）。 */
  writers?: readonly ((directory: Directory, signal?: AbortSignal) => Promise<void>)[];
  /** HTML 模板资产 moduleId（readAssetText 读取）。 */
  htmlModuleId: number;
  /** 由模板、data URL 集合与 stage 目录生成最终 index.html 内容。 */
  buildHtml: (template: string, dataUrls: Record<string, string>, directory: Directory) => string;
};

export type ChartPreviewWebviewPlanResult = {
  uri: string;
  allowingReadAccessToURL: string;
  dispose: () => void;
};

const REMOTE_STAGE_CONCURRENCY = 4;

const remoteLoads = createInflightGuard<string>();
let partSequence = 0;

async function downloadRemoteAsset(url: string, bytes: number, directory: Directory, fileName: string, signal?: AbortSignal): Promise<File> {
  if (signal?.aborted) throw signal.reason ?? new Error('操作已取消');
  const assertCurrent = captureResourceWrites('shared');
  const target = new File(directory, fileName);
  if (target.exists && target.size === bytes) return target;
  const partName = fileName + '.' + (++partSequence) + '.part';
  const part = new File(directory, partName);
  let published = false;
  try {
    await downloadChartResource(directory, partName, url, signal);
    if (signal?.aborted) throw signal.reason ?? new Error('操作已取消');
    assertCurrent();
    if (part.size !== bytes) throw new Error('远程资产大小不匹配：' + fileName);
    if (target.exists) target.delete();
    part.move(target);
    published = true;
    return target;
  } finally { if (!published && part.exists) part.delete(); }
}

async function stageRemoteAsset(
  url: string,
  bytes: number,
  sessionDirectory: Directory,
  fileName: string,
  cacheDirectory?: Directory,
  signal?: AbortSignal,
): Promise<File> {
  const assertGeneration = captureResourceWrites('shared');
  const sourceDirectory = cacheDirectory ?? sessionDirectory;
  ensureParentDirectory(sourceDirectory, fileName);
  if (signal?.aborted) throw signal.reason ?? new Error('操作已取消');
  const source = cacheDirectory
    ? await remoteLoads.share(JSON.stringify([sourceDirectory.uri, fileName, url, bytes, resourceWriteGeneration('shared')]),
      sharedSignal => { assertGeneration(); return downloadRemoteAsset(url, bytes, sourceDirectory, fileName, sharedSignal); }, signal)
    : await downloadRemoteAsset(url, bytes, sourceDirectory, fileName, signal);
  if (signal?.aborted) throw signal.reason ?? new Error('操作已取消');
  if (!cacheDirectory) return source;

  ensureParentDirectory(sessionDirectory, fileName);
  const target = new File(sessionDirectory, fileName);
  if (target.exists && target.size === source.size) return target;
  if (target.exists) target.delete();
  const payload = await source.bytes();
  if (signal?.aborted) throw signal.reason ?? new Error('操作已取消');
  target.create({ intermediates: true, overwrite: true });
  target.write(payload);
  if (target.size !== source.size) {
    throw new Error(`远程资产复制失败：${fileName}`);
  }
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
): Promise<ChartPreviewWebviewPlanResult> {
  const assertCurrent = captureResourceWrites('shared', signal);
  assertCurrent();
  const directory = plan.directory ?? createChartPreviewSessionDirectory(plan.directoryName);

  try {
    await loadItemsBounded({ items: plan.stagedAssets, concurrency: REMOTE_STAGE_CONCURRENCY,
      signal, failureMode: 'throw', load: async (asset) => {
      assertCurrent();
      ensureParentDirectory(directory, asset.fileName);
      if ('moduleId' in asset) {
        await stageAsset(asset.moduleId, asset.fileName, directory);
      } else {
        await stageRemoteAsset(
          asset.url,
          asset.bytes,
          directory,
          asset.fileName,
          plan.remoteCacheDirectory,
          signal,
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
        );
        dataUrls[asset.key] = `data:audio/wav;base64,${await staged.base64()}`;
      }
    }

    for (const writer of plan.writers ?? []) {
      assertCurrent();
      await writer(directory, signal);
      assertCurrent();
    }

    const template = await readAssetText(plan.htmlModuleId);
    assertCurrent();
    const html = plan.buildHtml(template, dataUrls, directory);
    const htmlFile = new File(directory, 'index.html');
    htmlFile.create({ overwrite: true });
    htmlFile.write(html);

    return {
      uri: htmlFile.uri,
      allowingReadAccessToURL: directory.uri,
      dispose: () => disposeChartPreviewSessionDirectory(directory),
    };
  } catch (error) {
    disposeChartPreviewSessionDirectory(directory);
    throw error;
  }
}
