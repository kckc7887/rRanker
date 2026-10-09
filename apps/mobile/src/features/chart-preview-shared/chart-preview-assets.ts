import { Asset } from 'expo-asset';
import { Directory, File, Paths } from 'expo-file-system';
import { copyAsync, deleteAsync, makeDirectoryAsync } from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { resolveChartPreviewAssetUri } from './chart-preview-asset-uri';
import { recordRuntimeError } from '@/services/runtime-diagnostics-recorder';
import { captureResourceWrites } from '@/services/snapshot-cache-utils';
import { runSharedCacheFileOperation } from '@/features/storage-management/fs-storage';

let sessionCounter = 0;
const usedStageDirectories = new Set<string>();

export async function chartPreviewStageDirectory(name: string): Promise<Directory> {
  const directory = new Directory(Paths.cache, name);
  usedStageDirectories.add(directory.uri.replace(/\/+$/u, ''));
  await runSharedCacheFileOperation(() => makeDirectoryAsync(directory.uri, { intermediates: true }));
  return directory;
}

export function isChartPreviewStageDirectoryInUse(uri: string): boolean {
  return usedStageDirectories.has(uri.replace(/\/+$/u, ''));
}

export async function createChartPreviewSessionDirectory(name: string): Promise<Directory> {
  sessionCounter += 1;
  const directory = new Directory(Paths.cache, `${name}-session-${Date.now()}-${sessionCounter}`);
  await runSharedCacheFileOperation(() => makeDirectoryAsync(directory.uri, { intermediates: true }));
  return directory;
}

export async function disposeChartPreviewSessionDirectory(directory: Directory): Promise<void> {
  try { await deleteAsync(directory.uri, { idempotent: true }); }
  catch (error) { recordRuntimeError('chart-preview-cleanup', error, false, { phase: 'cleanup' }); }
}

export async function stageAsset(moduleId: number, fileName: string, directory: Directory, signal?: AbortSignal): Promise<File> {
  const assertCurrent = captureResourceWrites('shared', signal);
  assertCurrent();
  const sourceUri = await loadAssetFileUri(moduleId, fileName);
  assertCurrent();
  const target = new File(directory, fileName);
  await deleteAsync(target.uri, { idempotent: true });
  await copyAsync({ from: sourceUri, to: target.uri });
  assertCurrent();
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
