/**
 * 谱面确认 WebView stage 资产公共层：
 * 负责缓存 stage 目录创建、expo-asset 模块资产解析下载（含 Android
 * release 资源标识符回退）、落盘与读文本，不感知具体游戏；
 * 各游戏 stage 目录名由调用方传入。
 */

import { Asset } from 'expo-asset';
import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import { resolveChartPreviewAssetUri } from './chart-preview-asset-uri';

let sessionCounter = 0;

export function chartPreviewStageDirectory(name: string): Directory {
  const directory = new Directory(Paths.cache, name);
  directory.create({ intermediates: true, idempotent: true });
  return directory;
}

/** 每次预览独占 stage，避免切谱和并发准备互相覆盖。 */
export function createChartPreviewSessionDirectory(name: string): Directory {
  sessionCounter += 1;
  const directory = new Directory(Paths.cache, `${name}-session-${Date.now()}-${sessionCounter}`);
  directory.create({ intermediates: true, idempotent: true });
  return directory;
}

export function disposeChartPreviewSessionDirectory(directory: Directory): void {
  if (directory.exists) directory.delete();
}

export async function stageAsset(moduleId: number, fileName: string, directory: Directory): Promise<File> {
  const sourceUri = await loadAssetFileUri(moduleId, fileName);
  const target = new File(directory, fileName);
  const source = new File(sourceUri);
  if (target.exists) target.delete();
  source.copy(target);
  return target;
}

export async function loadAssetFileUri(moduleId: number, fileName: string): Promise<string> {
  const asset = Asset.fromModule(moduleId);
  await asset.downloadAsync();
  if (!asset.localUri) throw new Error(`无法加载资源 ${fileName}`);

  const resolved = resolveChartPreviewAssetUri(asset.localUri, asset.type, Platform.OS);
  if (!resolved.requiresDownload) return resolved.uri;

  const embeddedAsset = Asset.fromURI(resolved.uri);
  await embeddedAsset.downloadAsync();
  if (!embeddedAsset.localUri) throw new Error(`无法加载资源 ${fileName}`);
  return embeddedAsset.localUri;
}

export async function readAssetText(moduleId: number): Promise<string> {
  const sourceUri = await loadAssetFileUri(moduleId, 'index.html');
  return await new File(sourceUri).text();
}
