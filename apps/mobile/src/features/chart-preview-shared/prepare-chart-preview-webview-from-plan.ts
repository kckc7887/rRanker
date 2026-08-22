/**
 * 谱面确认 WebView prepare 层声明式清单执行器（公共路径）：
 * 各游戏 prepare 模块只声明清单（stage 目录名、落盘资产、data URL 资产、
 * 额外写盘回调、HTML 模板与 buildHtml），由本执行器按固定顺序完成
 * 「stage 目录 → 落盘资产 → data URL 资产 → 额外写盘 → 读模板 →
 * 生成并写入 index.html」，落盘文件集合与返回值由清单决定，不感知具体游戏。
 * 落盘与资产解析复用本目录 chart-preview-assets 公共层，不重复实现。
 * 资产来源用判别联合表达：moduleId 为本地 bundle 资产（每次覆盖落盘），
 * url + bytes 为对象存储远程资产（已缓存且大小匹配时跳过下载）。
 */

import { Directory, File } from 'expo-file-system';
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
  /** 按序落盘的资产，fileName 支持 'skin/Tap2.png' 形式的相对路径。 */
  stagedAssets: readonly ChartPreviewStagedAsset[];
  /** 生成 data:audio/wav data URL 的资产，结果以 key 汇入传给 buildHtml 的 Record。 */
  dataUrlAssets?: readonly ChartPreviewDataUrlAsset[];
  /** 额外写盘回调（如 music-data.js）。 */
  writers?: readonly ((directory: Directory) => Promise<void>)[];
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

/** 远程资产下载到 stage 目录：已存在且大小匹配则跳过；否则经 .part 下载、校验后替换。 */
async function stageRemoteAsset(
  url: string,
  bytes: number,
  directory: Directory,
  fileName: string,
): Promise<File> {
  const target = new File(directory, fileName);
  if (target.exists && target.size === bytes) return target;

  const partFile = new File(directory, `${fileName}.part`);
  let partMoved = false;
  try {
    if (partFile.exists) partFile.delete();
    await File.downloadFileAsync(url, partFile, { idempotent: true });
    if (partFile.size !== bytes) {
      throw new Error(`远程资产大小不匹配：${fileName}`);
    }
    if (target.exists) target.delete();
    partFile.move(target);
    partMoved = true;
    return target;
  } finally {
    if (!partMoved && partFile.exists) partFile.delete();
  }
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
): Promise<ChartPreviewWebviewPlanResult> {
  const directory = plan.directory ?? createChartPreviewSessionDirectory(plan.directoryName);

  try {
    for (const asset of plan.stagedAssets) {
      ensureParentDirectory(directory, asset.fileName);
      if ('moduleId' in asset) {
        await stageAsset(asset.moduleId, asset.fileName, directory);
      } else {
        await stageRemoteAsset(asset.url, asset.bytes, directory, asset.fileName);
      }
    }

    const dataUrls: Record<string, string> = {};
    for (const asset of plan.dataUrlAssets ?? []) {
      if ('moduleId' in asset) {
        const sourceUri = await loadAssetFileUri(asset.moduleId, asset.fileName);
        dataUrls[asset.key] = `data:audio/wav;base64,${await new File(sourceUri).base64()}`;
      } else {
        ensureParentDirectory(directory, asset.fileName);
        const staged = await stageRemoteAsset(asset.url, asset.bytes, directory, asset.fileName);
        dataUrls[asset.key] = `data:audio/wav;base64,${await staged.base64()}`;
      }
    }

    for (const writer of plan.writers ?? []) {
      await writer(directory);
    }

    const template = await readAssetText(plan.htmlModuleId);
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
