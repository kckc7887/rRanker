/**
 * 谱面确认 WebView prepare 层声明式清单执行器（公共路径）：
 * 各游戏 prepare 模块只声明清单（stage 目录名、落盘资产、data URL 资产、
 * 额外写盘回调、HTML 模板与 buildHtml），由本执行器按固定顺序完成
 * 「stage 目录 → 落盘资产 → data URL 资产 → 额外写盘 → 读模板 →
 * 生成并写入 index.html」，落盘文件集合与返回值由清单决定，不感知具体游戏。
 * 落盘与资产解析复用 maimai prepare 模块的公共函数，不重复实现。
 */

import { Directory, File } from 'expo-file-system';
import {
  chartPreviewStageDirectory,
  loadAssetFileUri,
  readAssetText,
  stageAsset,
} from '@/features/maimai-chart-preview/prepare-chart-preview-webview';

export type ChartPreviewWebviewPlan = {
  /** stage 目录名（舞萌默认 'rranker-chart-preview'，其它游戏自定义）。 */
  directoryName: string;
  /** 按序 stageAsset 落盘的资产，fileName 支持 'skin/Tap2.png' 形式的相对路径。 */
  stagedAssets: readonly { fileName: string; moduleId: number }[];
  /** 经 loadAssetFileUri + base64 生成 data:audio/wav data URL 的资产，结果以 key 汇入传给 buildHtml 的 Record。 */
  dataUrlAssets?: readonly { key: string; moduleId: number; fileName: string }[];
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
};

export async function prepareChartPreviewWebviewFromPlan(
  plan: ChartPreviewWebviewPlan,
): Promise<ChartPreviewWebviewPlanResult> {
  const directory = chartPreviewStageDirectory(plan.directoryName);

  for (const { fileName, moduleId } of plan.stagedAssets) {
    const separatorIndex = fileName.lastIndexOf('/');
    if (separatorIndex > 0) {
      new Directory(directory, fileName.slice(0, separatorIndex))
        .create({ intermediates: true, idempotent: true });
    }
    await stageAsset(moduleId, fileName, directory);
  }

  const dataUrls: Record<string, string> = {};
  for (const { key, moduleId, fileName } of plan.dataUrlAssets ?? []) {
    const sourceUri = await loadAssetFileUri(moduleId, fileName);
    dataUrls[key] = `data:audio/wav;base64,${await new File(sourceUri).base64()}`;
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
  };
}
